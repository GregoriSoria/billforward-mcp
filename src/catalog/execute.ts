import type { AxiosInstance } from 'axios';
import type { CatalogEntry } from './entries.js';

export async function executeCatalogEntry(
  client: AxiosInstance,
  entry: CatalogEntry,
  args: Record<string, unknown>,
): Promise<unknown> {
  // ponytail: BF wants ASC/DESC; models send desc/orderBy — normalize once for all list ops.
  const argsIn: Record<string, unknown> = { ...args };
  if (argsIn.orderBy != null && argsIn.order_by == null) argsIn.order_by = argsIn.orderBy;
  if (typeof argsIn.order === 'string') argsIn.order = argsIn.order.toUpperCase();

  let path = entry.path;
  for (const key of entry.pathParams ?? []) {
    const value = argsIn[key];
    if (value == null || value === '') throw new Error(`Missing path param ${key}`);
    path = path.replace(`{${key}}`, encodeURIComponent(String(value)));
  }
  if (path.includes('{')) throw new Error(`Unresolved path params in ${path}`);
  const paramKeys = [
    ...(entry.queryParams ?? []),
    ...Object.keys(argsIn).filter((k) => k.startsWith('meta.')),
  ];
  const params = Object.fromEntries(
    paramKeys.filter((k) => argsIn[k] !== undefined).map((k) => [k, argsIn[k]]),
  );
  const body =
    entry.method === 'GET' || entry.method === 'DELETE'
      ? undefined
      : Object.fromEntries(
          (entry.bodyKeys ?? []).filter((k) => argsIn[k] !== undefined).map((k) => [k, argsIn[k]]),
        );
  const response = await client.request({ method: entry.method, url: path, params, data: body });
  return response.data;
}
