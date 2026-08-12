import { describe, it, expect, beforeEach } from 'vitest';
import { environmentParam, getClient } from './billforward.js';
import { getCatalogEntry } from './catalog/search.js';
import { registerCatalogTools } from './tools/discovery/catalog-tools.js';
import { registerGeneralTools } from './tools/overview/general.js';

// Capture a registered tool's handler without a live McpServer.
function captureTools(registerFn: (server: any) => void) {
  const tools = new Map<string, { definition: any; handler: any }>();
  const fakeServer = {
    registerTool: (name: string, definition: any, handler: any) => {
      tools.set(name, { definition, handler });
    },
  };
  registerFn(fakeServer);
  return tools;
}

function captureHandler(registerFn: (server: any) => void, toolName: string) {
  return captureTools(registerFn).get(toolName)?.handler;
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

  it('defaults to sandbox when both sandbox and production are configured and none requested', () => {
    process.env.BILLFORWARD_SANDBOX_ACCESS_TOKEN = 'sbx';
    process.env.BILLFORWARD_PRODUCTION_ACCESS_TOKEN = 'prd';
    expect(getClient().defaults.params.access_token).toBe('sbx');
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

  it("selects arbitrary names and defaults omit to the first sandbox", () => {
    process.env.BILLFORWARD_ENVIRONMENTS = JSON.stringify({
      dev: { token: "dev-token", type: "sandbox" },
      staging: { token: "staging-token", type: "sandbox" },
      prod: { token: "prod-token", type: "production" },
    });

    expect(getClient("staging").defaults.params.access_token).toBe("staging-token");
    expect(getClient().defaults.params.access_token).toBe("dev-token");
  });

  it("aliases environment=sandbox to the first sandbox-typed named env", () => {
    process.env.BILLFORWARD_ENVIRONMENTS = JSON.stringify({
      dev: { token: "dev-token", type: "sandbox" },
      prod: { token: "prod-token", type: "production" },
    });

    expect(getClient("sandbox").defaults.params.access_token).toBe("dev-token");
  });

  it("throws when omitting environment if only production envs exist", () => {
    process.env.BILLFORWARD_ENVIRONMENTS = JSON.stringify({
      prod: { token: "prod-token", type: "production" },
      prod2: { token: "prod2-token", type: "production" },
    });

    expect(() => getClient()).toThrow(/none are sandbox/);
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

  it("getClient default is used by tools when environment is omitted (no multi-env error)", () => {
    process.env.BILLFORWARD_SANDBOX_ACCESS_TOKEN = "sbx";
    process.env.BILLFORWARD_PRODUCTION_ACCESS_TOKEN = "prd";
    expect(() => getClient()).not.toThrow();
    expect(getClient().defaults.params.access_token).toBe("sbx");
  });

  it("call-api blocks writes in a read-only environment", async () => {
    process.env.BILLFORWARD_ENVIRONMENTS = JSON.stringify({
      dev: { token: "dev-token", type: "sandbox", readonly: false },
      prod: { token: "prod-token", type: "production", readonly: true },
    });
    const handler = captureHandler(registerCatalogTools, "call-api");

    const response = await handler({
      environment: "prod",
      name: "create-account",
      args: { profile: { email: "person@example.com", firstName: "Test", lastName: "User" } },
    });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toMatch(/'prod' environment is read-only/);
  });

  it("catalog includes write operations for invoice and charge", () => {
    expect(getCatalogEntry("issue-invoice")?.write).toBe(true);
    expect(getCatalogEntry("create-charge")?.write).toBe(true);
  });

  it("help lists names, types, and modes without secrets or URLs", async () => {
    process.env.BILLFORWARD_ENVIRONMENTS = JSON.stringify({
      dev: { token: "dev-secret", type: "sandbox" },
      prod: { token: "prod-secret", type: "production", readonly: false },
    });
    const handler = captureHandler(registerGeneralTools, "help");

    const response = await handler({});
    const text = response.content[0].text;

    expect(text).toContain("dev: sandbox, read-only");
    expect(text).toContain("prod: production, write-enabled");
    expect(text).toContain("Omit `environment` to default to the first sandbox");
    expect(text).toContain("environment=sandbox");
    expect(text).not.toContain("dev-secret");
    expect(text).not.toContain("prod-secret");
    expect(text).not.toContain("https://");
  });

  it("help returns an actionable error for an invalid catalog", async () => {
    process.env.BILLFORWARD_ENVIRONMENTS = "{";
    const handler = captureHandler(registerGeneralTools, "help");

    const response = await handler({});

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toMatch(
      /BILLFORWARD_ENVIRONMENTS must be valid JSON/,
    );
  });

  it("help redacts an invalid environment name", async () => {
    const invalidName = "https://internal.example/v1?token=sentinel-secret";
    process.env.BILLFORWARD_ENVIRONMENTS = JSON.stringify({
      [invalidName]: { token: "valid-token", type: "sandbox" },
    });
    const handler = captureHandler(registerGeneralTools, "help");

    const response = await handler({});
    const text = response.content[0].text;

    expect(response.isError).toBe(true);
    expect(text).toMatch(/invalid environment name/);
    expect(text).not.toContain("https://internal.example/v1");
    expect(text).not.toContain("sentinel-secret");
  });
});
