# Safe Search and Account History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace unsafe generic Billforward search with exact or explicitly bounded local matching, expose explicit account lookup, and add documented account history reads with diagnostics.

**Architecture:** Add a small shared read-observability helper that wraps a GET request into result, diagnostic, and error data without leaking tokens or PII. Keep tool registration files as the public boundary: `search` handles detection and bounded name matching, account tools handle explicit identifiers/metadata and account history, while existing list tools retain their current simple output.

**Tech Stack:** TypeScript, MCP SDK, Axios, Zod, Vitest, Axios Mock Adapter.

## Global Constraints

- Use GET-only Billforward requests; do not alter credentials.
- Never use generic `filter` query parameters.
- Do not do a global scan for account history or payments.
- Diagnostics must omit access tokens, authorization, cookies, e-mail addresses, and response payloads.
- Keep the existing dependencies; cap requested records with `MAX_RECORDS_LIMIT`.

---

### Task 1: Add read diagnostics and safe local match primitives

**Files:**
- Create: `src/tools/read-diagnostics.ts`
- Test: `src/tools/search/unified.test.ts`

**Interfaces:**
- Produces `readResource(client, resource, endpoint, params)` returning `{ data?, diagnostic, error? }`.
- Produces `normalizeCompanyName(value)` and `toSafeParams(params)` for tool-local matching and diagnostics.

- [ ] **Step 1: Write the failing tests**

```ts
it('normalizes accents and punctuation for exact company names', () => {
  expect(normalizeCompanyName(' Ácme, S.A. ')).toBe('acme sa');
});

it('keeps a failed resource read in errors with no token or email', async () => {
  mock.onGet('/accounts').reply(503, { message: 'down' });
  const output = await handler({ query: 'ACC-1', entity: 'all', match: 'exact' });
  expect(output.errors[0]).toMatchObject({ resource: 'accounts', status: 503 });
  expect(JSON.stringify(output)).not.toMatch(/access_token|test@example.com/);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm test src/tools/search/unified.test.ts`

Expected: FAIL because the helper and tests do not yet exist.

- [ ] **Step 3: Write the minimal implementation**

```ts
export function normalizeCompanyName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export async function readResource(client, resource, endpoint, params = {}) {
  const started = Date.now();
  try {
    const response = await client.get(endpoint, { params });
    return { data: response.data, diagnostic: diagnosticFrom(response, resource, endpoint, params, started) };
  } catch (cause) {
    return { error: errorFrom(cause, resource, endpoint, params, started) };
  }
}
```

`diagnosticFrom` must collect status, duration, returned-record count, returned IDs, safe params, and one documented request/correlation ID header when present. `errorFrom` uses the same safe request context and an HTTP/network message only.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `pnpm test src/tools/search/unified.test.ts`

Expected: PASS for the new helper assertions.

- [ ] **Step 5: Commit the helper cycle**

```bash
git add src/tools/read-diagnostics.ts src/tools/search/unified.test.ts
git commit -m "feat: add safe read diagnostics"
```

### Task 2: Make unified search exact by default and bounded by entity

**Files:**
- Modify: `src/tools/search/unified.ts`
- Modify: `src/tools/search/unified.test.ts`

**Interfaces:**
- Consumes `readResource`, `normalizeCompanyName`, `MAX_RECORDS_LIMIT`.
- Produces `search({ query, entity, match, limit, environment })` output with `accounts`, `subscriptions`, `invoices`, `diagnostics`, `errors`, and `truncated`.

- [ ] **Step 1: Write the failing tests**

```ts
it('uses the dedicated email endpoint for an exact account lookup', async () => {
  await handler({ query: 'billing@example.test', entity: 'accounts', match: 'exact', limit: 5 });
  expect(mock.history.get.map(r => r.url)).toContain('/accounts/email/billing@example.test');
  expect(mock.history.get.some(r => r.params?.filter)).toBe(false);
});

it('does not return a non-equal company name for match=exact', async () => {
  mock.onGet('/accounts').reply(200, { results: [{ id: 'ACC-OTHER', profile: { companyName: 'Acme Holdings' } }] });
  const output = await textOutput(handler({ query: 'Acme', entity: 'accounts', match: 'exact', limit: 5 }));
  expect(output.accounts).toEqual([]);
});

it('labels a contains company match as approximate', async () => {
  mock.onGet('/accounts').reply(200, { results: [{ id: 'ACC-1', profile: { companyName: 'Acme Holdings' } }] });
  const output = await textOutput(handler({ query: 'Acme', entity: 'accounts', match: 'contains', limit: 5 }));
  expect(output.accounts[0]).toMatchObject({ id: 'ACC-1', match: 'companyName-contains-local', approximate: true });
});

it('does not call subscriptions or invoices when entity=accounts', async () => {
  await handler({ query: 'ACC-1', entity: 'accounts', match: 'exact', limit: 5 });
  expect(mock.history.get.map(r => r.url)).not.toContain('/subscriptions/ACC-1');
  expect(mock.history.get.map(r => r.url)).not.toContain('/invoices');
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm test src/tools/search/unified.test.ts`

Expected: FAIL because `entity`/`match` are absent and the current code still sends `filter`.

- [ ] **Step 3: Write the minimal implementation**

```ts
entity: z.enum(['accounts', 'subscriptions', 'invoices', 'all']).default('all'),
match: z.enum(['exact', 'contains']).default('exact'),
```

Route exact e-mail and matching entity IDs only to their documented detail endpoints. For free text, page `/accounts` in a fixed `records` size and finite scan cap, compare `profile.companyName` locally, and set `truncated` whenever the API response indicates more records than the scan examined. Do not query subscriptions/invoices for a company-name request. Report skipped/unsupported resource semantics in diagnostics rather than fabricating matches.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `pnpm test src/tools/search/unified.test.ts`

Expected: PASS, including no request with `filter`.

- [ ] **Step 5: Commit the search cycle**

```bash
git add src/tools/search/unified.ts src/tools/search/unified.test.ts
git commit -m "fix: make Billforward search explicit"
```

### Task 3: Add explicit account lookup and confirmed account history

**Files:**
- Modify: `src/tools/customers/accounts.ts`
- Create: `src/tools/customers/accounts.test.ts`

**Interfaces:**
- Consumes `readResource`, `MAX_RECORDS_LIMIT`.
- Produces `find-accounts({ accountId?, email?, metadata? })`.
- Produces `get-account-history({ accountId, from?, to?, limit? })` with account-scoped blocks and diagnostics/errors.

- [ ] **Step 1: Write the failing tests**

```ts
it('converts explicit metadata filters to documented meta parameters', async () => {
  await findAccounts({ metadata: { salesforce_account_id: '001xx' }, limit: 5 });
  expect(mock.history.get[0].params).toMatchObject({ 'meta.salesforce_account_id': '001xx' });
});

it('keeps invoice history when subscriptions fail', async () => {
  mock.onGet('/accounts/ACC-1').reply(200, { results: [{ id: 'ACC-1' }] });
  mock.onGet('/subscriptions/account/ACC-1').reply(500, { message: 'unavailable' });
  mock.onGet('/accounts/ACC-1/invoices').reply(200, { results: [{ id: 'INV-1', accountID: 'ACC-1' }] });
  const output = await textOutput(historyHandler({ accountId: 'ACC-1', limit: 5 }));
  expect(output.invoices.results).toHaveLength(1);
  expect(output.errors).toContainEqual(expect.objectContaining({ resource: 'subscriptions', status: 500 }));
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm test src/tools/customers/accounts.test.ts`

Expected: FAIL because the tools are not registered.

- [ ] **Step 3: Write the minimal implementation**

`find-accounts` chooses exactly one documented lookup path: `/accounts/{id}`, `/accounts/email/{email}`, or `/accounts` with `meta.*` parameters. Reject calls without a filter and do not add an undocumented company-name parameter.

`get-account-history` issues three parallel safe reads:

```ts
readResource(client, 'account', `/accounts/${accountId}`),
readResource(client, 'subscriptions', `/subscriptions/account/${accountId}`, historyParams),
readResource(client, 'invoices', `/accounts/${accountId}/invoices`, historyParams),
```

Use documented pagination and ordering parameters. Apply optional `from`/`to` to returned date fields locally and attach a limitation note. Return `payments: { available: false, reason: 'No account-scoped payments endpoint was confirmed.' }`; do not call `/payments` globally.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `pnpm test src/tools/customers/accounts.test.ts`

Expected: PASS for metadata translation and partial-history failure behavior.

- [ ] **Step 5: Commit the accounts cycle**

```bash
git add src/tools/customers/accounts.ts src/tools/customers/accounts.test.ts
git commit -m "feat: add explicit account history reads"
```

### Task 4: Correct adjacent silent failures and user guidance

**Files:**
- Modify: `src/tools/customers/invoices.ts`
- Modify: `src/tools/insights/customer360.ts`
- Modify: `src/tools/overview/general.ts`
- Modify: `README.md`
- Modify: `src/tools/search/unified.test.ts`

**Interfaces:**
- Keeps existing tool names while removing silent `.catch(() => {})` from touched read paths.
- Produces accurate tool descriptions and metadata guidance.

- [ ] **Step 1: Write the failing documentation/assertion tests**

```ts
it('does not advertise key-value syntax for search metadata', () => {
  expect(metadataSchemaUsageTip()).not.toContain("search query using 'key: value'");
});

it('returns invoice metadata fetch failures as diagnostics rather than swallowing them', async () => {
  mock.onGet('/invoices/INV-1/metadata').reply(500);
  const output = await textOutput(invoiceHandler({ invoiceId: 'INV-1' }));
  expect(output.errors).toContainEqual(expect.objectContaining({ resource: 'invoice-metadata' }));
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `pnpm test src/tools/search/unified.test.ts src/tools/customers/accounts.test.ts`

Expected: FAIL because the current guidance claims unsupported `key: value` syntax and invoice metadata errors are ignored.

- [ ] **Step 3: Write the minimal implementation and docs**

Replace silent catches in touched code with safe error collection. Update `help`, README, and tool descriptions to distinguish exact lookup from local approximate company matching, document `meta.<key>=<value>`, and state that business history and webhooks/notifications do not necessarily equal API request logs. Document the account-history endpoint composition and its unavailable payments block.

Change `get-customer-summary` after exact account resolution to call
`/subscriptions/account/{accountId}` and `/accounts/{accountId}/invoices` with
its existing bounded limits and documented ordering, rather than generic
`filter` parameters. Preserve its compact mapping and make any resource
failure visible instead of treating it as an empty collection.

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `pnpm test src/tools/search/unified.test.ts src/tools/customers/accounts.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the documentation cycle**

```bash
git add README.md src/tools/customers/invoices.ts src/tools/insights/customer360.ts src/tools/overview/general.ts src/tools/search/unified.test.ts
git commit -m "docs: clarify Billforward search limits"
```

### Task 5: Run full verification

**Files:**
- Verify: all changed source and test files

- [ ] **Step 1: Run the changed-tool suite**

Run: `pnpm test src/tools/search/unified.test.ts src/tools/customers/accounts.test.ts`

Expected: PASS with all new behavioral tests.

- [ ] **Step 2: Run the full suite**

Run: `pnpm test`

Expected: exit code 0 with no failures.

- [ ] **Step 3: Build and run protocol regression checks**

Run: `pnpm run build`

Expected: TypeScript compilation succeeds and the protocol/environment test command exits 0.

- [ ] **Step 4: Inspect the final diff**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only intended files changed.
