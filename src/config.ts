export const MAX_RECORDS_LIMIT = process.env.BILLFORWARD_MAX_RESULTS
  ? parseInt(process.env.BILLFORWARD_MAX_RESULTS, 10)
  : 200;

export const DEFAULT_RECORDS_LIMIT = process.env.BILLFORWARD_DEFAULT_RESULTS
  ? parseInt(process.env.BILLFORWARD_DEFAULT_RESULTS, 10)
  : 10;

export const TIMEOUT_MS = process.env.BILLFORWARD_TIMEOUT
  ? parseInt(process.env.BILLFORWARD_TIMEOUT, 10)
  : 15000;

// O modo read-only por padrão agora é true
export const IS_READ_ONLY = process.env.BILLFORWARD_READ_ONLY !== 'false';

export type Environment = 'sandbox' | 'production';

const SANDBOX_URL = process.env.BILLFORWARD_SANDBOX_URL || 'https://app-sandbox.billforward.net/v1/';
const PRODUCTION_URL = process.env.BILLFORWARD_PRODUCTION_URL || 'https://app.billforward.net/v1/';

// Reads process.env on every call so tests can configure env before invoking.
// Legacy BILLFORWARD_ACCESS_TOKEN maps to whichever environment BILLFORWARD_ENVIRONMENT
// names (sandbox when unset — the historical default), keeping old configs working.
export function resolveEnvironments(): Map<Environment, { token: string; baseUrl: string }> {
  const legacyToken = process.env.BILLFORWARD_ACCESS_TOKEN;
  const legacyEnv = (process.env.BILLFORWARD_ENVIRONMENT || 'sandbox').toLowerCase();

  const sandboxToken =
    process.env.BILLFORWARD_SANDBOX_ACCESS_TOKEN || (legacyEnv !== 'production' ? legacyToken : undefined);
  const productionToken =
    process.env.BILLFORWARD_PRODUCTION_ACCESS_TOKEN || (legacyEnv === 'production' ? legacyToken : undefined);

  const map = new Map<Environment, { token: string; baseUrl: string }>();
  if (sandboxToken) map.set('sandbox', { token: sandboxToken, baseUrl: SANDBOX_URL });
  if (productionToken) map.set('production', { token: productionToken, baseUrl: PRODUCTION_URL });
  return map;
}
