type SafeValue = string | number | boolean;
type Params = Record<string, unknown>;
type ReadClient = { get(endpoint: string, config?: any): Promise<unknown> };
type ReadResponse = { data: unknown; status: number; headers: Record<string, unknown> };

export type ReadDiagnostic = {
  resource: string;
  endpoint: string;
  params: Record<string, SafeValue>;
  status?: number;
  durationMs: number;
  records: number;
  ids: string[];
  requestId?: string;
};

const sensitiveParam = /token|authorization|cookie|email/i;
const email = /[^\s@/]+@[^\s@/]+\.[^\s@/]+/;
const tokenLike = /bearer\s+\S+|(?:(?:access|refresh|api)[_\s-]*)?token\s*[:=]\s*\S+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/i;

export function normalizeCompanyName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\./g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function toSafeParams(params: Params = {}): Record<string, SafeValue> {
  return Object.fromEntries(Object.entries(params).filter(([key, value]) =>
    !sensitiveParam.test(key) &&
    (typeof value === 'number' || typeof value === 'boolean' || (typeof value === 'string' && !email.test(value) && !tokenLike.test(value)))
  )) as Record<string, SafeValue>;
}

function safeEndpoint(endpoint: string) {
  return endpoint.split('?')[0].split('/').map((segment) => {
    let value = segment;
    try { value = decodeURIComponent(segment); } catch { /* retain malformed encoding for the safety check */ }
    return email.test(value) || tokenLike.test(value) ? '[redacted]' : segment;
  }).join('/');
}

function recordsFrom(data: unknown) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && Array.isArray((data as { results?: unknown }).results)) {
    return (data as { results: unknown[] }).results;
  }
  return [];
}

function requestId(headers: Record<string, unknown>) {
  const id = headers['x-request-id'] || headers['x-correlation-id'];
  return typeof id === 'string' && !email.test(id) && !tokenLike.test(id) ? id : undefined;
}

function diagnosticFrom(
  response: ReadResponse,
  resource: string,
  endpoint: string,
  params: Params,
  started: number,
): ReadDiagnostic {
  const records = recordsFrom(response.data);
  const id = requestId(response.headers);
  return {
    resource,
    endpoint: safeEndpoint(endpoint),
    params: toSafeParams(params),
    status: response.status,
    durationMs: Date.now() - started,
    records: records.length,
    ids: records.flatMap((record) => {
      const value = record && typeof record === 'object' ? (record as { id?: unknown }).id : undefined;
      return typeof value === 'string' && !email.test(value) && !tokenLike.test(value) ? [value] : [];
    }),
    ...(id ? { requestId: id } : {}),
  };
}

function errorFrom(cause: unknown, resource: string, endpoint: string, params: Params, started: number): ReadDiagnostic & { message: string } {
  const response = (cause as { response?: { status?: unknown; headers?: Record<string, unknown> } })?.response;
  const status = response?.status;
  const id = response?.headers && requestId(response.headers);
  return {
    resource,
    endpoint: safeEndpoint(endpoint),
    params: toSafeParams(params),
    ...(typeof status === 'number' ? { status } : {}),
    durationMs: Date.now() - started,
    records: 0,
    ids: [],
    ...(id ? { requestId: id } : {}),
    message: typeof status === 'number' ? `HTTP ${status}` : 'Network error',
  };
}

export async function readResource(client: ReadClient, resource: string, endpoint: string, params: Params = {}) {
  const started = Date.now();
  try {
    const response = await client.get(endpoint, { params }) as ReadResponse;
    return { data: response.data, diagnostic: diagnosticFrom(response, resource, endpoint, params, started) };
  } catch (cause) {
    const error = errorFrom(cause, resource, endpoint, params, started);
    return { diagnostic: error, error };
  }
}
