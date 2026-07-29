import { beforeEach, describe, expect, it } from "vitest";
import { resolveEnvironments } from "./config.js";

const CONFIG_VARS = [
  "BILLFORWARD_ENVIRONMENTS",
  "BILLFORWARD_SANDBOX_ACCESS_TOKEN",
  "BILLFORWARD_PRODUCTION_ACCESS_TOKEN",
  "BILLFORWARD_ACCESS_TOKEN",
  "BILLFORWARD_ENVIRONMENT",
  "BILLFORWARD_SANDBOX_URL",
  "BILLFORWARD_PRODUCTION_URL",
  "BILLFORWARD_READ_ONLY",
];

describe("resolveEnvironments", () => {
  beforeEach(() => {
    for (const name of CONFIG_VARS) delete process.env[name];
  });

  it("parses any number of named environments", () => {
    process.env.BILLFORWARD_ENVIRONMENTS = JSON.stringify({
      dev: { token: "dev-token", type: "sandbox" },
      staging: { token: "staging-token", type: "sandbox", readonly: true },
      prod: { token: "prod-token", type: "production", readonly: false },
    });

    const environments = resolveEnvironments();

    expect([...environments.keys()]).toEqual(["dev", "staging", "prod"]);
    expect(environments.get("dev")).toMatchObject({
      token: "dev-token",
      type: "sandbox",
      readonly: true,
      baseUrl: "https://app-sandbox.billforward.net/v1/",
    });
    expect(environments.get("prod")).toMatchObject({
      token: "prod-token",
      type: "production",
      readonly: false,
      baseUrl: "https://app.billforward.net/v1/",
    });
  });

  it("accepts an HTTP(S) baseUrl override", () => {
    process.env.BILLFORWARD_ENVIRONMENTS = JSON.stringify({
      qa: {
        token: "qa-token",
        type: "sandbox",
        baseUrl: "https://billforward.example.test/v1/",
      },
    });

    expect(resolveEnvironments().get("qa")?.baseUrl).toBe(
      "https://billforward.example.test/v1/",
    );
  });

  it("merges named and legacy entries without changing legacy readonly", () => {
    process.env.BILLFORWARD_ENVIRONMENTS = JSON.stringify({
      dev: { token: "dev-token", type: "sandbox" },
    });
    process.env.BILLFORWARD_PRODUCTION_ACCESS_TOKEN = "legacy-prod";
    process.env.BILLFORWARD_READ_ONLY = "false";

    const environments = resolveEnvironments();

    expect(environments.get("dev")?.readonly).toBe(true);
    expect(environments.get("production")).toMatchObject({
      token: "legacy-prod",
      type: "production",
      readonly: false,
    });
  });

  it.each([
    ["invalid JSON", "{", /BILLFORWARD_ENVIRONMENTS must be valid JSON/],
    ["array root", "[]", /must be a JSON object/],
    ["invalid name", JSON.stringify({ "QA Env": { token: "secret", type: "sandbox" } }), /invalid environment name/],
    ["empty token", JSON.stringify({ qa: { token: "", type: "sandbox" } }), /invalid configuration for environment 'qa'/],
    ["invalid type", JSON.stringify({ qa: { token: "secret", type: "preview" } }), /invalid configuration for environment 'qa'/],
    ["string readonly", JSON.stringify({ qa: { token: "secret", type: "sandbox", readonly: "false" } }), /invalid configuration for environment 'qa'/],
    ["non-http URL", JSON.stringify({ qa: { token: "secret", type: "sandbox", baseUrl: "file:///tmp/api" } }), /invalid configuration for environment 'qa'/],
    ["unknown field", JSON.stringify({ qa: { token: "secret", type: "sandbox", readOnly: false } }), /invalid configuration for environment 'qa'/],
  ])("rejects %s without exposing the token", (_case, catalog, message) => {
    process.env.BILLFORWARD_ENVIRONMENTS = catalog;

    expect(() => resolveEnvironments()).toThrow(message);
    try {
      resolveEnvironments();
    } catch (error) {
      expect(String(error)).not.toContain("secret");
      expect(String(error)).not.toContain(catalog);
    }
  });

  it("rejects a collision with an existing sandbox entry", () => {
    process.env.BILLFORWARD_ENVIRONMENTS = JSON.stringify({
      sandbox: { token: "named-secret", type: "sandbox" },
    });
    process.env.BILLFORWARD_SANDBOX_ACCESS_TOKEN = "legacy-secret";

    expect(() => resolveEnvironments()).toThrow(/Duplicate environment name 'sandbox'/);
  });

  it("preserves legacy single-token routing", () => {
    process.env.BILLFORWARD_ACCESS_TOKEN = "legacy";
    process.env.BILLFORWARD_ENVIRONMENT = "production";

    expect(resolveEnvironments().get("production")).toMatchObject({
      token: "legacy",
      type: "production",
      readonly: true,
    });
  });
});
