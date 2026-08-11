import type { AxiosInstance } from 'axios';
import type { CatalogEntry } from './entries.js';

export async function executeCatalogEntry(
  client: AxiosInstance,
  entry: CatalogEntry,
  args: Record<string, unknown>,
): Promise<unknown> {
  let path = entry.path;
  for (const key of entry.pathParams ?? []) {
    const value = args[key];
    if (value == null || value === '') throw new Error(`Missing path param ${key}`);
    path = path.replace(`{${key}}`, encodeURIComponent(String(value)));
  }
  if (path.includes('{')) throw new Error(`Unresolved path params in ${path}`);
  const params = Object.fromEntries(
    (entry.queryParams ?? []).filter((k) => args[k] !== undefined).map((k) => [k, args[k]]),
  );
  const body =
    entry.method === 'GET' || entry.method === 'DELETE'
      ? undefined
      : Object.fromEntries(
          (entry.bodyKeys ?? []).filter((k) => args[k] !== undefined).map((k) => [k, args[k]]),
        );
  const response = await client.request({ method: entry.method, url: path, params, data: body });
  return response.data;
}
