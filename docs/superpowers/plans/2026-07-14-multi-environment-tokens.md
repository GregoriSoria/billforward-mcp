# Multi-environment tokens (sandbox + production) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the MCP server hold sandbox and production tokens at the same time, pick the environment per tool call from an optional `environment` parameter, and error clearly when the choice is ambiguous — without breaking existing single-token setups.

**Architecture:** The module-level `bfClient` axios singleton is replaced by `getClient(environment?)`, which reads env vars fresh, resolves which environment to use (per the rules below), and returns a freshly built axios instance. `getClient` throws a descriptive `Error` on ambiguity/misconfiguration; because every tool handler already wraps its API calls in `try/catch` that returns `{ isError: true }` with `error.message`, those messages reach the LLM with no extra handler code. Each tool gains one optional `environment` enum field spread from a shared constant.

**Tech Stack:** TypeScript (ESM), `@modelcontextprotocol/sdk`, `axios`, `zod`, Vitest, pnpm.

## Global Constraints

- Package is published to npm; existing config (`BILLFORWARD_ACCESS_TOKEN` + `BILLFORWARD_ENVIRONMENT`) MUST keep working unchanged. Retrocompatible feature bump: `1.1.1 → 1.2.0`.
- No new dependencies.
- `getClient` MUST read `process.env` at call time (not module import time), so tests set env before invoking.
- Never crash at boot when zero tokens are configured; the error surfaces only on the first tool call.
- No warning/complaint when only one (or neither) environment is configured.
- Environment values are exactly the strings `'sandbox'` and `'production'`.
- Error messages are written for an LLM to read and act on, in English (matches existing server messages).
- Read-only mode stays global (`BILLFORWARD_READ_ONLY`) — out of scope here.
- Follow existing file style: one `register*Tools` function per domain file, tool handlers wrapped in `try/catch` returning `{ isError, content }`.

---

## File Structure

- `src/config.ts` (modify) — replace the single-environment `BASE_URL` block with `resolveEnvironments()` + the `Environment` type. Keep `MAX_RECORDS_LIMIT`, `DEFAULT_RECORDS_LIMIT`, `TIMEOUT_MS`, `IS_READ_ONLY`.
- `src/billforward.ts` (rewrite) — export `getClient(environment?)` and the shared `environmentParam` zod field; internal `createClient()` builds an axios instance with the existing response interceptor.
- `src/billforward.test.ts` (create) — unit tests for the resolution rules + one end-to-end wiring test through a real tool handler.
- `src/index.test.ts` (modify) — stop importing the removed `bfClient`; mock a client obtained from `getClient('sandbox')`.
- `src/tools/**/*.ts` (modify, 9 files) — swap `bfClient` import for `getClient`/`environmentParam`, add `environment` to each `inputSchema`, resolve `const client = getClient(environment)` once per handler.
- `README.md` (modify) — env-var table + config example.
- `package.json` (modify) — version bump + add the new test to the `build` script.

`BASE_URL` is imported only by `billforward.ts`, so removing it is safe.

---

### Task 1: Core resolver (`config.ts` + `billforward.ts`)

**Files:**
- Modify: `src/config.ts` (lines 16-19 — the `ENVIRONMENT`/`BASE_URL` block)
- Rewrite: `src/billforward.ts`
- Test: `src/billforward.test.ts` (create)

**Interfaces:**
- Consumes: `process.env`, `TIMEOUT_MS` from config.
- Produces:
  - `type Environment = 'sandbox' | 'production'` (from `config.ts`)
  - `resolveEnvironments(): Map<Environment, { token: string; baseUrl: string }>` (from `config.ts`)
  - `getClient(environment?: Environment): AxiosInstance` (from `billforward.ts`)
  - `environmentParam` — `{ environment: z.ZodOptional<z.ZodEnum<...>> }` (from `billforward.ts`)

- [ ] **Step 1: Write the failing test**

Create `src/billforward.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/billforward.test.ts`
Expected: FAIL — `getClient` is not exported yet (import error / not a function).

- [ ] **Step 3: Rewrite `config.ts`**

Replace lines 16-19 (the `ENVIRONMENT` / `BASE_URL` block) with the code below. Leave lines 1-14 (`MAX_RECORDS_LIMIT`, `DEFAULT_RECORDS_LIMIT`, `TIMEOUT_MS`, `IS_READ_ONLY`) untouched.

```ts
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
```

Note: the two URL constants read env at import — that's fine (URLs never change per-test here). Only token discovery must be per-call, and it is.

- [ ] **Step 4: Rewrite `billforward.ts`**

Replace the entire file with:

```ts
import axios, { AxiosInstance } from 'axios';
import { z } from 'zod';

import { TIMEOUT_MS, resolveEnvironments, type Environment } from './config.js';

// Shared zod field spread into every API-touching tool's inputSchema.
export const environmentParam = {
  environment: z
    .enum(['sandbox', 'production'])
    .optional()
    .describe(
      "Which Billforward environment to target. Required when both sandbox and production are configured; " +
        "if only one is configured it is used automatically. Ask the user if you're unsure which to use."
    ),
};

function createClient(token: string, baseUrl: string): AxiosInstance {
  const client = axios.create({
    baseURL: baseUrl,
    timeout: TIMEOUT_MS,
    params: { access_token: token },
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });

  // Interceptor for logging, debugging and resilience
  client.interceptors.response.use(
    (response) => response,
    (error) => {
      const status = error.response?.status;
      const data = error.response?.data;

      if (status === 429) {
        const retryAfter = error.response?.headers['retry-after'];
        const message = `Rate limit exceeded (429). ${
          retryAfter ? `Please wait ${retryAfter} seconds before retrying.` : 'Please wait a few moments before retrying.'
        }`;
        console.error(`Billforward API [429]: ${message}`);
        error.message = message;
      } else {
        const apiMessage = data?.errorMessage || data?.message || error.message;
        console.error(
          `Billforward API Error [${status || 'NETWORK'}]:`,
          status ? JSON.stringify(data, null, 2) : error.message
        );
        error.message = apiMessage;
      }

      throw error;
    }
  );

  return client;
}

// Resolve the axios client for a tool call. Throws an LLM-readable Error on
// ambiguity/misconfiguration; tool try/catch turns that into an isError response.
export function getClient(environment?: Environment): AxiosInstance {
  const envs = resolveEnvironments();
  const available = [...envs.keys()];

  if (environment) {
    const cfg = envs.get(environment);
    if (!cfg) {
      const hint = available.length
        ? ` Available: ${available.join(', ')}.`
        : ' No Billforward token is configured.';
      throw new Error(`The '${environment}' environment is not configured on this server.${hint}`);
    }
    return createClient(cfg.token, cfg.baseUrl);
  }

  if (available.length === 0) {
    throw new Error(
      'No Billforward token is configured. Ask the user to set BILLFORWARD_SANDBOX_ACCESS_TOKEN and/or BILLFORWARD_PRODUCTION_ACCESS_TOKEN.'
    );
  }
  if (available.length > 1) {
    throw new Error(
      `Two environments are configured (${available.join(', ')}). Re-call this tool with the \`environment\` parameter set to one of them.`
    );
  }

  const only = envs.get(available[0])!;
  return createClient(only.token, only.baseUrl);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/billforward.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/config.ts src/billforward.ts src/billforward.test.ts
git commit -m "feat: getClient(environment?) resolver replacing the bfClient singleton"
```

---

### Task 2: Repair the `index.test.ts` plumbing test

The old test imports the removed `bfClient` singleton and mocks it. Rework it to mock a client from `getClient('sandbox')`. It stays a plumbing test (it calls `.get` directly, never the handlers).

**Files:**
- Modify: `src/index.test.ts` (lines 1-6 imports; line 17 mock creation; `beforeAll`; every `bfClient.get` in the `it` bodies)

**Interfaces:**
- Consumes: `getClient` from Task 1.

- [ ] **Step 1: Replace the import + module-level mock (lines 1-17)**

Replace:

```ts
import { bfClient } from "./billforward.js";
```
with
```ts
import { getClient } from "./billforward.js";
import type { AxiosInstance } from "axios";
```

Replace:

```ts
// @ts-ignore - bypassing strict type mismatch between axios-mock-adapter and project axios versions
const mock = new MockAdapter(bfClient as any);
```
with
```ts
let client: AxiosInstance;
// @ts-ignore - bypassing strict type mismatch between axios-mock-adapter and project axios versions
let mock: MockAdapter;
```

- [ ] **Step 2: Configure env + build the mocked client at the top of `beforeAll`**

Immediately after `beforeAll(() => {` (before the first `mock.onGet(...)`), insert:

```ts
    process.env.BILLFORWARD_SANDBOX_ACCESS_TOKEN = 'test-token';
    client = getClient('sandbox');
    // @ts-ignore - axios-mock-adapter version mismatch
    mock = new MockAdapter(client as any);
```

- [ ] **Step 3: Point every direct call at `client`**

In each `it(...)` body, replace `bfClient.get(` with `client.get(`. There are 14 occurrences (list-accounts, get-account, get-account-by-email, list-profiles, list-subscriptions, get-subscription, list-invoices, get-invoice, list-payments, list-receipts, get-payment, list-products, list-product-rate-plans, get-rate-plan).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/index.test.ts`
Expected: PASS (all existing assertions green).

- [ ] **Step 5: Commit**

```bash
git add src/index.test.ts
git commit -m "test: mock getClient('sandbox') instead of the removed bfClient singleton"
```

---

### Task 3: Wire `environment` into the customer domain tools

**Files:**
- Modify: `src/tools/customers/accounts.ts`
- Modify: `src/tools/customers/subscriptions.ts`
- Modify: `src/tools/customers/invoices.ts`
- Modify: `src/tools/customers/payments.ts`
- Modify: `src/tools/customers/charges.ts`
- Test: `src/billforward.test.ts` (append one behavioral test)

**Interfaces:**
- Consumes: `getClient`, `environmentParam` from Task 1.

The mechanical pattern for **every** tool in these files:
1. Change the import.
2. Add `...environmentParam,` as the first entry of each `inputSchema` object.
3. Add `environment` to the handler's destructured argument object.
4. As the first statement inside the handler's `try` (for write tools, after the `isReadOnly` guard), add `const client = getClient(environment);`.
5. Replace every `bfClient` in that handler with `client`.

- [ ] **Step 1: Write the failing behavioral test (append to `src/billforward.test.ts`)**

This proves the wiring surfaces the resolver error to the LLM through a real handler. Append:

```ts
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
    expect(res.content[0].text).toMatch(/Two environments are configured/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/billforward.test.ts`
Expected: FAIL — `registerAccountTools` still imports `bfClient`; handler doesn't call `getClient`, so no error is thrown (assertion on `isError` fails).

- [ ] **Step 3: Edit `accounts.ts`**

Change line 3:
```ts
import { getClient, environmentParam } from "../../billforward.js";
```

For each of the 6 tools (`list-accounts`, `get-account-by-email`, `get-account`, `list-profiles`, `create-account`, `update-account`):
- Prepend `...environmentParam,` to its `inputSchema` object.
- Add `environment` to the destructured handler arg (e.g. `async ({ environment, limit, offset, ... }) =>`).
- Insert `const client = getClient(environment);` as the first line inside `try` (for `create-account`/`update-account`, keep the `isReadOnly` guard before the `try` exactly as-is — the guard returns before any client is needed).
- Replace `bfClient` → `client` in each handler body.

Example (`list-accounts`, showing the shape):
```ts
      inputSchema: {
        ...environmentParam,
        limit: z.number().optional().default(DEFAULT_RECORDS_LIMIT).describe(...),
        // ...unchanged fields...
      }
    },
    async ({ environment, limit, offset, orderBy, orderDirection, metadata, created_after, created_before }) => {
      try {
        const client = getClient(environment);
        const safeLimit = Math.min(limit, MAX_RECORDS_LIMIT);
        // ...unchanged, but bfClient.get(...) → client.get(...)
```

- [ ] **Step 4: Edit `subscriptions.ts`**

Change line 3 to `import { getClient, environmentParam } from "../../billforward.js";`. Apply the same pattern to all 4 tools (`list-subscriptions`, `get-subscription`, `create-subscription`, `cancel-subscription`). Note `cancel-subscription` currently makes no API call — still add `...environmentParam` to its schema and `environment` to its args for a uniform interface, but it needs no `getClient` line (leave its body as-is).

- [ ] **Step 5: Edit `invoices.ts`**

Change line 3. Apply the pattern to `list-invoices`, `get-invoice`, and (inside the `if (!isReadOnly)` block) `issue-invoice`. `list-invoices` and `get-invoice` each call `bfClient` more than once (metadata sub-resource) — resolve `const client = getClient(environment)` once at the top of `try` and replace all `bfClient` occurrences in that handler.

- [ ] **Step 6: Edit `payments.ts`**

The module-level helper `listFilteredByCreatedRange` (lines 13-58) uses `bfClient` directly. Give it the client as a parameter:

```ts
async function listFilteredByCreatedRange(
  client: AxiosInstance,
  resourcePath: string,
  { records, offset, created_after, created_before }: { records: number; offset: number; created_after?: string; created_before?: string }
) {
  // ...unchanged body, but bfClient.get(...) → client.get(...)
```

Add `import type { AxiosInstance } from "axios";` and change line 3 to `import { getClient, environmentParam } from "../../billforward.js";`. In `list-payments` and `list-receipts`, resolve `const client = getClient(environment);` at the top of `try`, pass `client` as the first arg to `listFilteredByCreatedRange(client, "/payments", {...})`, and replace the inline `bfClient.get(...)` fallback with `client.get(...)`. Apply the schema/arg pattern to `list-payments`, `get-payment`, `list-receipts`.

- [ ] **Step 7: Edit `charges.ts`**

Change line 3. Apply the pattern to `create-charge` (inside the `if (!isReadOnly)` block): add `...environmentParam` to schema, `environment` to args, `const client = getClient(environment);` as first line of `try`, `bfClient` → `client`.

- [ ] **Step 8: Run the behavioral test + build**

Run: `pnpm test src/billforward.test.ts`
Expected: PASS (resolution tests + the new list-accounts wiring test).

Run: `pnpm run build`
Expected: `tsc` compiles with no errors (proves no stray `bfClient` references remain in these files), then `protocol.test.ts` + `index.test.ts` PASS.

- [ ] **Step 9: Commit**

```bash
git add src/tools/customers/ src/billforward.test.ts
git commit -m "feat: add environment parameter to customer domain tools"
```

---

### Task 4: Wire `environment` into pricing, search, insights, and overview tools

**Files:**
- Modify: `src/tools/pricing/plans.ts`
- Modify: `src/tools/search/unified.ts`
- Modify: `src/tools/insights/customer360.ts`
- Modify: `src/tools/overview/general.ts`

**Interfaces:**
- Consumes: `getClient`, `environmentParam`, `resolveEnvironments` from Tasks 1.

- [ ] **Step 1: Edit `plans.ts`**

Change line 3 to `import { getClient, environmentParam } from "../../billforward.js";`. Apply the standard pattern (schema `...environmentParam`, `environment` arg, `const client = getClient(environment);` first in `try`, `bfClient` → `client`) to `list-products`, `list-product-rate-plans`, `get-rate-plan`.

- [ ] **Step 2: Edit `unified.ts`**

Change line 3. On `search`: add `...environmentParam` to the `inputSchema`, add `environment` to args (`async ({ environment, query, limit }) =>`), resolve `const client = getClient(environment);` as the first line of `try`, and replace every `bfClient` in the parallel `tasks` array (8 occurrences) with `client`.

- [ ] **Step 3: Edit `customer360.ts`**

Change line 3. On `get-customer-summary`: add `...environmentParam` to schema, `environment` to args, `const client = getClient(environment);` at top of `try`, replace all `bfClient` (email lookup + the `Promise.all` block). On `get-metadata-schema`: its `inputSchema` is currently `{}` — set it to `{ ...environmentParam }`, add `environment` to args, resolve `const client = getClient(environment);` at top of `try`, replace all `bfClient` (the `Promise.all` block + the per-invoice metadata loop).

- [ ] **Step 4: Edit `general.ts` (`get-me` gains the param; `help` lists configured envs)**

Change line 2 to:
```ts
import { getClient, environmentParam } from "../../billforward.js";
import { resolveEnvironments } from "../../config.js";
```

`get-me` currently has no `inputSchema`. Add one and wire it:
```ts
    {
      description: "Validate API credentials and get information about the authenticated user/organization.",
      inputSchema: { ...environmentParam }
    },
    async ({ environment }) => {
      try {
        const client = getClient(environment);
        const response = await client.get("/organizations/mine");
```

`help` makes no API call — do **not** add `environment`. Make it report which environments are configured by computing them at call time and appending to the help text. Change the `help` handler to:
```ts
    async () => {
      const configured = [...resolveEnvironments().keys()];
      const envLine = configured.length
        ? `Configured environments: ${configured.join(", ")}.${configured.length > 1 ? " Pass \`environment\` on each tool call to choose." : ""}`
        : "No Billforward environment is configured yet — set BILLFORWARD_SANDBOX_ACCESS_TOKEN and/or BILLFORWARD_PRODUCTION_ACCESS_TOKEN.";
      const helpText = `
# Billforward MCP - Developer Guide
```
Append `\n\n${envLine}` to the end of the existing `helpText` template (just before the closing `` `.trim() ``), leaving the rest of the guide text unchanged.

- [ ] **Step 5: Build to verify everything compiles and existing tests pass**

Run: `pnpm run build`
Expected: `tsc` clean (no remaining `bfClient` references anywhere), `protocol.test.ts` + `index.test.ts` PASS.

Run: `pnpm test`
Expected: all tests PASS (protocol, index, billforward).

Verify no stray references remain:
Run: `grep -rn "bfClient" src/ || echo "clean"`
Expected: `clean`

- [ ] **Step 6: Commit**

```bash
git add src/tools/pricing/ src/tools/search/ src/tools/insights/ src/tools/overview/
git commit -m "feat: add environment parameter to pricing, search, insights, overview tools"
```

---

### Task 5: Docs and version bump

**Files:**
- Modify: `README.md` (config example ~lines 44-51; env-var table ~lines 60-70)
- Modify: `package.json` (version; `build` script)

- [ ] **Step 1: Update the `mcpServers` config example in `README.md`**

Replace the `"env"` block in the example (currently `BILLFORWARD_ACCESS_TOKEN` / `BILLFORWARD_ENVIRONMENT` / `BILLFORWARD_READ_ONLY`) with:
```json
      "env": {
        "BILLFORWARD_SANDBOX_ACCESS_TOKEN": "your_sandbox_token",
        "BILLFORWARD_PRODUCTION_ACCESS_TOKEN": "your_production_token",
        "BILLFORWARD_READ_ONLY": "true"
      }
```
Add a sentence under the example: "Configure whichever environments you have — one or both. When both are set, the LLM must pass `environment: \"sandbox\"` or `\"production\"` on each call; with only one set it is used automatically."

- [ ] **Step 2: Update the env-var table in `README.md`**

Replace the `BILLFORWARD_ENVIRONMENT` row and add the new token rows so the table reads:

| Variable | Default Value | Description |
|----------|---------------|-------------|
| `BILLFORWARD_SANDBOX_ACCESS_TOKEN` | _(none)_ | API token for the sandbox environment. |
| `BILLFORWARD_PRODUCTION_ACCESS_TOKEN` | _(none)_ | API token for the production environment. |
| `BILLFORWARD_ACCESS_TOKEN` | _(none)_ | **Legacy** single token. Still supported; maps to the environment named by `BILLFORWARD_ENVIRONMENT` (sandbox if unset). |
| `BILLFORWARD_ENVIRONMENT` | `sandbox` | **Legacy** — only routes the legacy `BILLFORWARD_ACCESS_TOKEN`. Ignored once you use the per-environment tokens above. |

Keep the existing `BILLFORWARD_READ_ONLY`, `BILLFORWARD_PRODUCTION_URL`, `BILLFORWARD_SANDBOX_URL`, `BILLFORWARD_DEFAULT_RESULTS`, `BILLFORWARD_MAX_RESULTS`, `BILLFORWARD_TIMEOUT` rows.

- [ ] **Step 3: Bump version and add the new test to the build gate in `package.json`**

Change `"version": "1.1.1"` to `"version": "1.2.0"`.
Change the `build` script from:
```json
    "build": "tsc && pnpm test src/protocol.test.ts src/index.test.ts",
```
to:
```json
    "build": "tsc && pnpm test src/protocol.test.ts src/index.test.ts src/billforward.test.ts",
```

- [ ] **Step 4: Verify the full build gate passes**

Run: `pnpm run build`
Expected: `tsc` clean; `protocol.test.ts`, `index.test.ts`, `billforward.test.ts` all PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md package.json
git commit -m "docs: document per-environment tokens; bump to 1.2.0"
```

---

## Self-Review

**Spec coverage:**
- Req 1 (two tokens simultaneously) → Task 1 `resolveEnvironments` builds a map of both.
- Req 2 (neither mandatory, no complaint) → Task 1 `getClient` boots lazily; empty map is silent until a call; config.ts emits no warnings.
- Req 3 (optional `environment` param per tool) → Tasks 3-4 spread `environmentParam` into every API-touching tool.
- Req 4 (resolution rules) → Task 1 `getClient` branches; Task 1 unit tests + Task 3 behavioral test cover the table.
- Req 5 (retrocompat) → Task 1 legacy fallback; `protocol.test.ts` (legacy token, unchanged) still passes; verified in Tasks 3-5 builds.
- Non-goal (read-only global) → untouched; `isReadOnly` guards left exactly as-is.
- Docs + bump → Task 5.

**Placeholder scan:** No TBD/TODO; every code step shows complete code; the repeated per-tool pattern is written out with a worked example and each file's tool list named explicitly (not "similar to Task N").

**Type consistency:** `Environment`, `resolveEnvironments`, `getClient`, `environmentParam` names used identically across Tasks 1-4. `getClient(environment?)` signature matches all call sites. `listFilteredByCreatedRange(client, resourcePath, opts)` new signature used consistently in Task 3 Step 6.
