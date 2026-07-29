# Named Billforward Environments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support any number of user-named Billforward environments, with fail-closed read-only policy per environment, without changing existing MCP configurations.

**Architecture:** Parse the optional `BILLFORWARD_ENVIRONMENTS` JSON catalog into the existing environment map and merge the two legacy names without silent collisions. Keep environment selection and write authorization in `getClient()`, so every API handler uses one shared routing and security boundary. Generalize the MCP field from a fixed enum to a validated slug and make all write tools enforce the selected entry at call time.

**Tech Stack:** TypeScript ESM, Zod 4, Axios, Model Context Protocol SDK, Vitest, pnpm.

## Global Constraints

- `BILLFORWARD_ENVIRONMENTS` is optional JSON keyed by lowercase slugs matching `^[a-z0-9][a-z0-9_-]*$`.
- Named entries require a non-empty `token` and `type: "sandbox" | "production"`.
- Named `readonly` is optional and defaults to `true`; only the literal boolean `false` enables writes.
- Named `baseUrl` is optional and, when present, must be an absolute HTTP(S) URL.
- Existing `BILLFORWARD_ACCESS_TOKEN`, `BILLFORWARD_ENVIRONMENT`, `BILLFORWARD_SANDBOX_ACCESS_TOKEN`, `BILLFORWARD_PRODUCTION_ACCESS_TOKEN`, URL overrides, and `BILLFORWARD_READ_ONLY` continue working unchanged.
- Named entries and legacy entries are additive; a duplicate `sandbox` or `production` name is an error, never a silent override.
- Invalid catalogs fail as a whole and no error may include tokens, catalog JSON, authentication parameters, or base URLs.
- One configured environment is selected automatically; two or more require an explicit `environment`; zero still fails lazily on the first resolving tool call.
- Every write path authorizes through `getClient(environment, { write: true })` before making an HTTP request.
- Write tools remain registered and enforce the selected environment at call time.
- No new dependencies.
- No live Billforward write validation.
- Do not run `npm publish`; publication remains the user's responsibility.

---

## File Structure

- `src/config.ts` — parse, validate, merge, and expose named plus legacy environment configuration.
- `src/config.test.ts` — trust-boundary and backward-compatibility tests for configuration parsing.
- `src/billforward.ts` — environment input schema, selection, Axios client creation, and centralized write guard.
- `src/billforward.test.ts` — resolver, schema, write-policy, registered-handler, and help-output tests.
- `src/index.ts` — register tools without a global read-only argument.
- `src/tools/overview/general.ts` — safe environment/mode help output.
- `src/tools/customers/accounts.ts` — authorize account writes per selected environment.
- `src/tools/customers/subscriptions.ts` — authorize subscription writes per selected environment.
- `src/tools/customers/invoices.ts` — always register and authorize invoice writes per selected environment.
- `src/tools/customers/charges.ts` — always register and authorize charge writes per selected environment.
- `src/tools/customers/payments.ts` — remove the obsolete registration-time read-only argument.
- `src/tools/pricing/plans.ts` — remove the obsolete registration-time read-only argument.
- `README.md` — document the named catalog and unchanged legacy configuration.
- `package.json` — bump the backward-compatible feature version from `1.2.2` to `1.3.0`.

### Task 1: Parse and merge named environment configuration

**Files:**
- Create: `src/config.test.ts`
- Modify: `src/config.ts`

**Interfaces:**
- Consumes: `process.env`.
- Produces:
  - `ENVIRONMENT_NAME_PATTERN: RegExp`
  - `type Environment = string`
  - `type EnvironmentKind = "sandbox" | "production"`
  - `type EnvironmentConfig = { token: string; baseUrl: string; type: EnvironmentKind; readonly: boolean }`
  - `resolveEnvironments(): Map<Environment, EnvironmentConfig>`

- [ ] **Step 1: Write failing catalog and compatibility tests**

Create `src/config.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the new test to verify RED**

Run:

```bash
pnpm test src/config.test.ts
```

Expected: FAIL because `EnvironmentConfig` does not include `type` or
`readonly`, and `BILLFORWARD_ENVIRONMENTS` is not parsed.

- [ ] **Step 3: Implement strict catalog parsing and safe merging**

Replace the environment block in `src/config.ts` with:

```ts
import { z } from "zod";

export const ENVIRONMENT_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
export type Environment = string;
export type EnvironmentKind = "sandbox" | "production";
export type EnvironmentConfig = {
  token: string;
  baseUrl: string;
  type: EnvironmentKind;
  readonly: boolean;
};

const namedEnvironmentSchema = z.strictObject({
  token: z.string().min(1),
  type: z.enum(["sandbox", "production"]),
  readonly: z.boolean().optional().default(true),
  baseUrl: z
    .url()
    .refine((value) => ["http:", "https:"].includes(new URL(value).protocol))
    .optional(),
});

function defaultUrl(type: EnvironmentKind): string {
  return type === "production"
    ? process.env.BILLFORWARD_PRODUCTION_URL || "https://app.billforward.net/v1/"
    : process.env.BILLFORWARD_SANDBOX_URL || "https://app-sandbox.billforward.net/v1/";
}

function namedEnvironments(): Map<Environment, EnvironmentConfig> {
  const raw = process.env.BILLFORWARD_ENVIRONMENTS;
  const environments = new Map<Environment, EnvironmentConfig>();
  if (raw === undefined) return environments;

  let catalog: unknown;
  try {
    catalog = JSON.parse(raw);
  } catch {
    throw new Error("BILLFORWARD_ENVIRONMENTS must be valid JSON.");
  }
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
    throw new Error("BILLFORWARD_ENVIRONMENTS must be a JSON object.");
  }

  for (const [name, value] of Object.entries(catalog)) {
    if (!ENVIRONMENT_NAME_PATTERN.test(name)) {
      throw new Error(
        `BILLFORWARD_ENVIRONMENTS contains invalid environment name '${name}'. ` +
          "Use lowercase letters, numbers, underscores, or hyphens.",
      );
    }
    const parsed = namedEnvironmentSchema.safeParse(value);
    if (!parsed.success) {
      throw new Error(`BILLFORWARD_ENVIRONMENTS has invalid configuration for environment '${name}'.`);
    }
    environments.set(name, {
      token: parsed.data.token,
      type: parsed.data.type,
      readonly: parsed.data.readonly,
      baseUrl: parsed.data.baseUrl || defaultUrl(parsed.data.type),
    });
  }
  return environments;
}

function addEnvironment(
  environments: Map<Environment, EnvironmentConfig>,
  name: Environment,
  config: EnvironmentConfig,
): void {
  if (environments.has(name)) {
    throw new Error(`Duplicate environment name '${name}' in Billforward configuration.`);
  }
  environments.set(name, config);
}

export function resolveEnvironments(): Map<Environment, EnvironmentConfig> {
  const environments = namedEnvironments();
  const legacyToken = process.env.BILLFORWARD_ACCESS_TOKEN;
  const legacyEnvironment = (process.env.BILLFORWARD_ENVIRONMENT || "sandbox").toLowerCase();
  const readonly = process.env.BILLFORWARD_READ_ONLY !== "false";
  const sandboxToken =
    process.env.BILLFORWARD_SANDBOX_ACCESS_TOKEN ||
    (legacyEnvironment !== "production" ? legacyToken : undefined);
  const productionToken =
    process.env.BILLFORWARD_PRODUCTION_ACCESS_TOKEN ||
    (legacyEnvironment === "production" ? legacyToken : undefined);

  if (sandboxToken) {
    addEnvironment(environments, "sandbox", {
      token: sandboxToken,
      type: "sandbox",
      readonly,
      baseUrl: defaultUrl("sandbox"),
    });
  }
  if (productionToken) {
    addEnvironment(environments, "production", {
      token: productionToken,
      type: "production",
      readonly,
      baseUrl: defaultUrl("production"),
    });
  }
  return environments;
}
```

Keep `MAX_RECORDS_LIMIT`, `DEFAULT_RECORDS_LIMIT`, `TIMEOUT_MS`, and
`IS_READ_ONLY` unchanged above this block until Task 3 removes the obsolete
registration-time use of `IS_READ_ONLY`.

- [ ] **Step 4: Run the focused and existing resolver tests**

Run:

```bash
pnpm test src/config.test.ts src/billforward.test.ts
```

Expected: PASS. Existing legacy tests remain green.

- [ ] **Step 5: Commit the configuration boundary**

```bash
git add src/config.ts src/config.test.ts
git commit -m "feat: parse named Billforward environments"
```

### Task 2: Generalize selection and centralize write authorization

**Files:**
- Modify: `src/billforward.test.ts`
- Modify: `src/billforward.ts`

**Interfaces:**
- Consumes:
  - `ENVIRONMENT_NAME_PATTERN`
  - `Environment`
  - `EnvironmentConfig`
  - `resolveEnvironments()`
- Produces:
  - `environmentParam.environment: z.ZodOptional<z.ZodString>`
  - `getClient(environment?: Environment, options?: { write?: boolean }): AxiosInstance`

- [ ] **Step 1: Add failing selection, schema, and write-policy tests**

In `src/billforward.test.ts`, add `BILLFORWARD_ENVIRONMENTS` and
`BILLFORWARD_READ_ONLY` to `TOKEN_VARS`, import `environmentParam`, and add:

```ts
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
```

Update old ambiguity assertions from `/Two environments are configured/` to
`/Multiple environments are configured/`.

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```bash
pnpm test src/billforward.test.ts
```

Expected: FAIL because the field is still a fixed enum, `getClient` has no
write option, and the ambiguity message still says "Two environments".

- [ ] **Step 3: Implement the generalized field and centralized guard**

In `src/billforward.ts`, import `ENVIRONMENT_NAME_PATTERN` and replace
`environmentParam` plus `getClient` with:

```ts
import {
  ENVIRONMENT_NAME_PATTERN,
  TIMEOUT_MS,
  resolveEnvironments,
  type Environment,
} from "./config.js";

export const environmentParam = {
  environment: z
    .string()
    .regex(ENVIRONMENT_NAME_PATTERN)
    .optional()
    .describe(
      "Named Billforward environment to target, such as dev, staging, or production. " +
        "Required when multiple environments are configured; if only one is configured it is used automatically. " +
        "Use help to see configured names and ask the user if unsure.",
    ),
};

export function getClient(
  environment?: Environment,
  options: { write?: boolean } = {},
): AxiosInstance {
  const environments = resolveEnvironments();
  const available = [...environments.keys()];
  let selected: Environment;

  if (environment) {
    selected = environment;
    if (!environments.has(selected)) {
      const hint = available.length
        ? ` Available: ${available.join(", ")}.${available.length === 1 ? ` Omit the \`environment\` parameter to use ${available[0]} automatically.` : ""}`
        : " No Billforward token is configured.";
      throw new Error(`The '${selected}' environment is not configured on this server.${hint}`);
    }
  } else {
    if (available.length === 0) {
      throw new Error(
        "No Billforward token is configured. Ask the user to set BILLFORWARD_ENVIRONMENTS, " +
          "BILLFORWARD_SANDBOX_ACCESS_TOKEN, BILLFORWARD_PRODUCTION_ACCESS_TOKEN, or BILLFORWARD_ACCESS_TOKEN.",
      );
    }
    if (available.length > 1) {
      throw new Error(
        `Multiple environments are configured (${available.join(", ")}). ` +
          "Re-call this tool with the `environment` parameter set to one of them.",
      );
    }
    selected = available[0];
  }

  const config = environments.get(selected)!;
  if (options.write && config.readonly) {
    throw new Error(
      `The '${selected}' environment is read-only. Write operations are disabled for this environment.`,
    );
  }
  return createClient(config.token, config.baseUrl);
}
```

Do not change `createClient` or the response interceptor.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
pnpm test src/config.test.ts src/billforward.test.ts
```

Expected: PASS with arbitrary-name selection, fail-closed writes, and legacy
behavior all green.

- [ ] **Step 5: Commit the resolver and permission boundary**

```bash
git add src/billforward.ts src/billforward.test.ts
git commit -m "feat: route and authorize named environments"
```

### Task 3: Enforce per-environment policy in every registered tool

**Files:**
- Modify: `src/billforward.test.ts`
- Modify: `src/index.ts`
- Modify: `src/tools/overview/general.ts`
- Modify: `src/tools/customers/accounts.ts`
- Modify: `src/tools/customers/subscriptions.ts`
- Modify: `src/tools/customers/invoices.ts`
- Modify: `src/tools/customers/charges.ts`
- Modify: `src/tools/customers/payments.ts`
- Modify: `src/tools/pricing/plans.ts`

**Interfaces:**
- Consumes:
  - `getClient(environment, { write: true })`
  - `resolveEnvironments(): Map<Environment, EnvironmentConfig>`
- Produces:
  - Registration functions that accept only `server: McpServer`
  - Help output containing environment name, type, and `read-only | write-enabled`

- [ ] **Step 1: Add failing registered-tool and help tests**

Update `captureHandler` in `src/billforward.test.ts` so it calls
`registerFn(fakeServer)` and records definitions:

```ts
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
```

Import `registerChargeTools`, `registerInvoiceTools`, and
`registerGeneralTools`, then add:

```ts
it("a registered write handler blocks the selected read-only environment", async () => {
  process.env.BILLFORWARD_ENVIRONMENTS = JSON.stringify({
    dev: { token: "dev-token", type: "sandbox", readonly: false },
    prod: { token: "prod-token", type: "production", readonly: true },
  });
  const handler = captureHandler(registerAccountTools, "create-account");

  const response = await handler({
    environment: "prod",
    profile: { email: "person@example.com", firstName: "Test", lastName: "User" },
  });

  expect(response.isError).toBe(true);
  expect(response.content[0].text).toMatch(/'prod' environment is read-only/);
});

it("registers invoice and charge write tools regardless of startup policy", () => {
  expect(captureTools(registerInvoiceTools).has("issue-invoice")).toBe(true);
  expect(captureTools(registerChargeTools).has("create-charge")).toBe(true);
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
  expect(text).toContain("Pass `environment` on each tool call");
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
```

- [ ] **Step 2: Run the handler tests to verify RED**

Run:

```bash
pnpm test src/billforward.test.ts
```

Expected: FAIL because handlers still use the registration-time global
`isReadOnly`, invoice and charge tools are conditionally absent, and help has
one global status.

- [ ] **Step 3: Move every write path to the shared guard**

Make these exact handler changes:

```ts
// src/tools/customers/accounts.ts
export function registerAccountTools(server: McpServer) {
  // In create-account and update-account, delete the `if (isReadOnly)` block.
  // Use this as the first statement inside each existing try:
  const client = getClient(environment, { write: true });
}

// src/tools/customers/subscriptions.ts
export function registerSubscriptionTools(server: McpServer) {
  // In create-subscription, delete the `if (isReadOnly)` block and use:
  const client = getClient(environment, { write: true });

  // In cancel-subscription, delete the `if (isReadOnly)` block and resolve
  // permission at the top of its existing try before returning its current
  // informational result:
  getClient(environment, { write: true });
}

// src/tools/customers/invoices.ts
export function registerInvoiceTools(server: McpServer) {
  // Remove the `if (!isReadOnly)` wrapper so issue-invoice is always registered.
  // Its handler uses:
  const client = getClient(environment, { write: true });
}

// src/tools/customers/charges.ts
export function registerChargeTools(server: McpServer) {
  // Remove the `if (!isReadOnly)` wrapper so create-charge is always registered.
  // Its handler uses:
  const client = getClient(environment, { write: true });
}

// These modules never mutate. Change only their function signatures:
// before
export function registerPaymentTools(server: McpServer, isReadOnly: boolean) {
// after
export function registerPaymentTools(server: McpServer) {

// before
export function registerPlanTools(server: McpServer, isReadOnly: boolean) {
// after
export function registerPlanTools(server: McpServer) {
```

Do not change endpoints, payloads, response formatting, or the existing
unfinished cancellation behavior.

- [ ] **Step 4: Make help derive status from resolved entries**

Change `registerGeneralTools` to accept only `server`. In the help handler,
replace the global status and current name-only line with:

```ts
async () => {
  try {
    const configured = [...resolveEnvironments().entries()];
    const environmentStatus = configured.length
      ? configured
          .map(
            ([name, config]) =>
              `${name}: ${config.type}, ${config.readonly ? "read-only" : "write-enabled"}`,
          )
          .join("\n")
      : "No Billforward environment is configured yet.";
    const choiceHint =
      configured.length > 1
        ? "\nPass `environment` on each tool call to choose one."
        : "";

    const helpText = `
# Billforward MCP - Developer Guide

## Core Tools
- **Insights**: \`get-customer-summary\`, \`get-metadata-schema\`
- **Accounts**: \`list-accounts\`, \`get-account\`, \`get-account-by-email\`
- **Subscriptions**: \`list-subscriptions\`, \`get-subscription\`
- **Invoices**: \`list-invoices\`, \`get-invoice\`
- **Payments**: \`list-payments\`, \`get-payment\`, \`list-receipts\`
- **Pricing**: \`list-products\`, \`list-product-rate-plans\`

## Search & Analysis Strategy
1. **Discover Metadata**: Run \`get-metadata-schema\` to see available custom fields for filtering.
2. **Fast Search**: Use \`search query="email or ID"\` for an exact lookup. A company name triggers a bounded local account-name scan; use \`match="contains"\` only for approximate matches.
3. **Deep Dive**: Use \`get-customer-summary query="email/ID"\` for a full 360 overview of a client.
4. **Time Filtering**: \`list-accounts\` supports real \`created_after\`/\`created_before\` filters. \`list-invoices\`/\`list-subscriptions\` only support \`period_start_after\`/\`period_start_before\` (Billforward has no native created-date filter for those resources). \`list-payments\`/\`list-receipts\` accept \`created_after\`/\`created_before\` but filter client-side since Billforward has no native date filter on those endpoints at all.
5. **Technical Filter**: Use \`list-accounts metadata={...}\` or \`find-accounts metadata={...}\`; these become exact API parameters such as \`meta.salesforce_account_id=001xx\`. Search does not support metadata key-value syntax.
6. **Account History**: Use \`get-account-history\` for documented account-scoped subscriptions and invoices. Its payments block is unavailable because no account-scoped payments endpoint is confirmed.
7. **Activity Caveat**: Business history and webhooks/notifications do not necessarily represent API request logs.

## Configured Environments
${environmentStatus}${choiceHint}
    `.trim();
    return { content: [{ type: "text", text: helpText }] };
  } catch (error: any) {
    return {
      isError: true,
      content: [{ type: "text", text: `Billforward configuration error: ${error.message}` }],
    };
  }
}
```

Use that callback for the existing `help` registration. Keep `get-me`
unchanged.

- [ ] **Step 5: Remove registration-time read-only wiring**

In `src/index.ts`, remove the `IS_READ_ONLY` import and call every registration
function with only `server`:

```ts
registerGeneralTools(server);
registerAccountTools(server);
registerSubscriptionTools(server);
registerInvoiceTools(server);
registerPaymentTools(server);
registerChargeTools(server);
registerPlanTools(server);
registerSearchTools(server);
registerInsightTools(server);
```

Remove the now-unused `IS_READ_ONLY` export from `src/config.ts`.

- [ ] **Step 6: Run handler, protocol, and full tests**

Run:

```bash
pnpm test src/billforward.test.ts src/protocol.test.ts
pnpm test
```

Expected: both commands PASS. The protocol test still observes clean JSON on
stdout, and all pre-existing tests stay green.

- [ ] **Step 7: Commit tool enforcement**

```bash
git add src/config.ts src/billforward.test.ts src/index.ts src/tools
git commit -m "feat: enforce readonly per Billforward environment"
```

### Task 4: Document, version, and verify the backward-compatible feature

**Files:**
- Modify: `README.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: the final configuration and tool behavior from Tasks 1–3.
- Produces: user-facing setup instructions and local package version `1.3.0`.

- [ ] **Step 1: Update the primary MCP example**

Replace the two-token example with a named catalog while retaining
`BILLFORWARD_READ_ONLY` only in the legacy section:

```json
{
  "mcpServers": {
    "billforward": {
      "command": "npx",
      "args": ["-y", "billforward-mcp"],
      "env": {
        "BILLFORWARD_ENVIRONMENTS": "{\"dev\":{\"token\":\"your_dev_token\",\"type\":\"sandbox\",\"readonly\":true},\"staging\":{\"token\":\"your_staging_token\",\"type\":\"sandbox\",\"readonly\":true},\"prod\":{\"token\":\"your_production_token\",\"type\":\"production\",\"readonly\":true}}"
      }
    }
  }
}
```

Immediately below it, document:

```md
Environment names are user-defined lowercase slugs. With one configured
environment, tools select it automatically. With two or more, pass the exact
name through the tool's `environment` parameter.

For named environments, omitted `readonly` means `true`; only the JSON boolean
`false` enables writes. An optional absolute HTTP(S) `baseUrl` overrides the
default selected by `type`.
```

- [ ] **Step 2: Extend the environment-variable table and compatibility notes**

Add this row:

```md
| `BILLFORWARD_ENVIRONMENTS` | _(none)_ | JSON object of named environments. Each entry requires `token` and `type`; `readonly` defaults to `true`; `baseUrl` is optional. |
```

Retain every existing variable row. Explain that the old variables continue to
create `sandbox` and `production`, still use global
`BILLFORWARD_READ_ONLY`, and may coexist with differently named catalog entries.
Document that duplicate names are rejected.

- [ ] **Step 3: Bump the local package feature version**

Change:

```json
"version": "1.2.2"
```

to:

```json
"version": "1.3.0"
```

Do not run `npm publish`.

- [ ] **Step 4: Run final verification**

Run:

```bash
pnpm test
pnpm run build
git diff --check
git status --short
```

Expected:

- all Vitest tests pass;
- TypeScript compilation and protocol/configuration tests pass;
- `git diff --check` prints nothing;
- only `README.md` and `package.json` remain for this task before commit;
- no npm publication occurs.

- [ ] **Step 5: Commit docs and version**

```bash
git add README.md package.json
git commit -m "docs: configure named Billforward environments"
```

## Final Review Gate

After all four task reviews are clean:

```bash
pnpm test
pnpm run build
git diff --check
git status --short --branch
```

Expected: all tests and build pass, no whitespace errors, and the branch is
clean. Dispatch the final whole-branch reviewer against merge base `05782d7`.
Do not push, merge, or publish without separate user authorization.
