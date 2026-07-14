import { describe, it, expect, beforeEach } from 'vitest';
import { getClient } from './billforward.js';

const TOKEN_VARS = [
  'BILLFORWARD_SANDBOX_ACCESS_TOKEN',
  'BILLFORWARD_PRODUCTION_ACCESS_TOKEN',
  'BILLFORWARD_ACCESS_TOKEN',
  'BILLFORWARD_ENVIRONMENT',
];

describe('getClient environment resolution', () => {
  beforeEach(() => {
    for (const v of TOKEN_VARS) delete process.env[v];
  });

  it('uses the only configured environment when none is requested', () => {
    process.env.BILLFORWARD_SANDBOX_ACCESS_TOKEN = 'sbx';
    const client = getClient();
    expect(client.defaults.params.access_token).toBe('sbx');
    expect(client.defaults.baseURL).toContain('sandbox');
  });

  it('throws asking to choose when both are configured and none requested', () => {
    process.env.BILLFORWARD_SANDBOX_ACCESS_TOKEN = 'sbx';
    process.env.BILLFORWARD_PRODUCTION_ACCESS_TOKEN = 'prd';
    expect(() => getClient()).toThrow(/Two environments are configured/);
  });

  it('honors an explicit environment when both are configured', () => {
    process.env.BILLFORWARD_SANDBOX_ACCESS_TOKEN = 'sbx';
    process.env.BILLFORWARD_PRODUCTION_ACCESS_TOKEN = 'prd';
    expect(getClient('production').defaults.params.access_token).toBe('prd');
    expect(getClient('sandbox').defaults.params.access_token).toBe('sbx');
  });

  it('throws when the requested environment is not configured', () => {
    process.env.BILLFORWARD_SANDBOX_ACCESS_TOKEN = 'sbx';
    expect(() => getClient('production')).toThrow(/'production' environment is not configured/);
  });

  it('maps legacy BILLFORWARD_ACCESS_TOKEN to production when BILLFORWARD_ENVIRONMENT=production', () => {
    process.env.BILLFORWARD_ACCESS_TOKEN = 'legacy';
    process.env.BILLFORWARD_ENVIRONMENT = 'production';
    expect(getClient().defaults.params.access_token).toBe('legacy');
    expect(getClient().defaults.baseURL).toContain('app.billforward.net');
  });

  it('maps legacy BILLFORWARD_ACCESS_TOKEN to sandbox by default', () => {
    process.env.BILLFORWARD_ACCESS_TOKEN = 'legacy';
    expect(getClient().defaults.baseURL).toContain('sandbox');
  });

  it('throws with a config hint when no token is set', () => {
    expect(() => getClient()).toThrow(/No Billforward token is configured/);
  });
});
