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

const ENVIRONMENT = (process.env.BILLFORWARD_ENVIRONMENT || 'sandbox').toLowerCase();
export const BASE_URL = ENVIRONMENT === 'production' 
  ? (process.env.BILLFORWARD_PRODUCTION_URL || 'https://app.billforward.net/v1/')
  : (process.env.BILLFORWARD_SANDBOX_URL || 'https://app-sandbox.billforward.net/v1/');
