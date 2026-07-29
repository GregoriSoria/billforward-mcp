import { describe, it, expect, beforeEach } from 'vitest';
import { environmentParam, getClient } from './billforward.js';
import { registerAccountTools } from './tools/customers/accounts.js';

// Capture a registered tool's handler without a live McpServer.
function captureHandler(registerFn: (server: any, ro: boolean) => void, toolName: string) {
  let handler: any;
  const fakeServer = {
    registerTool: (name: string, _def: unknown, cb: any) => {
      if (name === toolName) handler = cb;
    },
  };
  registerFn(fakeServer, true);
  return handler;
}

const TOKEN_VARS = [
  'BILLFORWARD_SANDBOX_ACCESS_TOKEN',
  'BILLFORWARD_PRODUCTION_ACCESS_TOKEN',
  'BILLFORWARD_ACCESS_TOKEN',
  'BILLFORWARD_ENVIRONMENT',
  'BILLFORWARD_ENVIRONMENTS',
  'BILLFORWARD_READ_ONLY',
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
    expect(() => getClient()).toThrow(/Multiple environments are configured/);
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

  it("selects arbitrary names and requires a name when several exist", () => {
    process.env.BILLFORWARD_ENVIRONMENTS = JSON.stringify({
      dev: { token: "dev-token", type: "sandbox" },
      staging: { token: "staging-token", type: "sandbox" },
      prod: { token: "prod-token", type: "production" },
    });

    expect(getClient("staging").defaults.params.access_token).toBe("staging-token");
    expect(() => getClient()).toThrow(/Multiple environments are configured.*dev, staging, prod/);
  });

  it("accepts a configured slug in the MCP environment schema", () => {
    expect(environmentParam.environment.safeParse("qa-2").success).toBe(true);
    expect(environmentParam.environment.safeParse("QA Env").success).toBe(false);
  });

  it("blocks writes in a named environment by default", () => {
    process.env.BILLFORWARD_ENVIRONMENTS = JSON.stringify({
      dev: { token: "never-show-this", type: "sandbox" },
    });

    expect(() => getClient("dev", { write: true })).toThrow(
      /The 'dev' environment is read-only/,
    );
  });

  it("allows writes only when readonly is literal false", () => {
    process.env.BILLFORWARD_ENVIRONMENTS = JSON.stringify({
      dev: { token: "dev-token", type: "sandbox", readonly: false },
      prod: { token: "prod-token", type: "production", readonly: true },
    });

    expect(getClient("dev", { write: true }).defaults.params.access_token).toBe("dev-token");
    expect(() => getClient("prod", { write: true })).toThrow(
      /The 'prod' environment is read-only/,
    );
  });

  it("preserves BILLFORWARD_READ_ONLY for legacy environments", () => {
    process.env.BILLFORWARD_SANDBOX_ACCESS_TOKEN = "legacy";
    process.env.BILLFORWARD_READ_ONLY = "false";

    expect(getClient("sandbox", { write: true }).defaults.params.access_token).toBe("legacy");
  });
});

describe('tool wiring surfaces resolver errors', () => {
  beforeEach(() => {
    for (const v of TOKEN_VARS) delete process.env[v];
  });

  it('list-accounts returns isError telling the LLM to choose when both envs are set', async () => {
    process.env.BILLFORWARD_SANDBOX_ACCESS_TOKEN = 'sbx';
    process.env.BILLFORWARD_PRODUCTION_ACCESS_TOKEN = 'prd';
    const handler = captureHandler(registerAccountTools, 'list-accounts');
    const res = await handler({ limit: 10, offset: 0, orderBy: 'created', orderDirection: 'DESC' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Multiple environments are configured/);
  });
});
