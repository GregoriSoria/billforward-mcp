# Progressive Billforward API coverage

**Date:** 2026-08-11

**Status:** Approved for implementation planning

## Problem

Investigations (e.g. credit note `CDT-61A31A7F`) fail because the MCP exposes
only a small subset of Billforward read endpoints. Registering every API
operation as its own MCP tool does not scale: hundreds of tool schemas blow
the context window and degrade tool-selection accuracy.

We need coverage of the full Billforward API surface while keeping a tiny
always-on MCP tool list, with the rest discovered through server-side tool
search (same idea as sfskills `search_skill` / `get_skill`, and portable
across hosts that lack Anthropic/Cursor `defer_loading`).

## Goals

1. Resolve any prefixed Billforward ID (`ACC-`, `CDT-`, `PAY-`, …) with one
   always-on tool.
2. Replace ad-hoc “get-by-email / local company-name scan” search paths with
   Billforward’s live `GET /search-v3?query=`.
3. Expose the rest of the API (lists, scoped GETs, writes) via a searchable
   catalog + execute path — not via hundreds of `registerTool` calls.
4. Preserve existing environment / readonly gating.

## Non-goals (this design)

- Host-side Anthropic `tool_search_tool_*` / Cursor `defer_loading` as a
  dependency (nice when present; must not be required).
- Perfect coverage of UUID-only entities without an explicit `resource` hint
  in the first slice.
- Registering `ADD-` (addresses) as get-by-id — addresses are embedded in
  profiles/search results; no confirmed top-level GET.
- Building a vector index; lexical/keyword search over the catalog is enough.

## Architecture

```text
Model
  ├─ lookup          (always-on)
  ├─ search-tools    (always-on)
  ├─ describe-tool   (always-on)
  ├─ call-api        (always-on)
  └─ help            (always-on)

lookup:
  PREFIX-id  → GET /{resource}/{id} via prefix map
  else       → GET /search-v3?query={string}

search-tools → catalog matches (name + one-line summary)
describe-tool → full catalog entry (method, path template, params)
call-api → execute catalog entry (writes blocked when env readonly)
```

### Always-on tools (~5)

| Tool | Role |
|------|------|
| `lookup` | Prefixed get-by-id **or** `search-v3` free-text / email |
| `search-tools` | Keyword search over the internal API catalog |
| `describe-tool` | Full schema/docs for one catalog entry |
| `call-api` | Execute a named catalog entry only (no arbitrary paths) |
| `help` | Short guidance: prefer `lookup` for IDs/text; catalog for the rest |

Optional later: keep a small set of convenience aliases if usage data demands
it. Default is **no** per-resource get tools.

### Catalog (data, not MCP tools)

A checked-in JSON (or TS const) catalog of Billforward operations:

```ts
{
  name: "list-credit-notes",
  summary: "List credit notes across the organization",
  method: "GET",
  path: "/credit-notes",
  queryParams: ["records", "offset", "order_by", "order"],
  write: false
}
```

`search-tools` ranks by name/summary/path tokens. `describe-tool` returns the
full entry. `call-api` fills path params and query/body from the tool args.

Writes (`write: true`) require `getClient(environment, { write: true })` and
fail with the existing readonly instructional error when the env is readonly.

## `lookup` behavior

Single tool, two modes:

1. **Get-by-id (prefix map)** — if `query` matches `^[A-Z]{2,4}-[A-Z0-9-]+$`
   (or known prefixes below), route to `GET {path}/{id}` and return the API
   JSON. Optional `resource` overrides the map when the ID has no prefix
   (UUID-only entities).
2. **Search-v3** — otherwise call `GET /search-v3?query={query}` with
   `records` / `offset` from tool args. Return `groupedResults` as-is.

Remove dedicated tools that this replaces:

- `get-account`, `get-account-by-email`, `get-subscription`, `get-invoice`,
  `get-payment`, `get-rate-plan`
- Current `search` tool’s local company-name scan and
  `/accounts/email/{email}` branch (search-v3 covers email/text)

Keep for now (until migrated into the catalog and removed as MCP tools):

- `list-*` family, `find-accounts` (metadata filters), `get-account-history`,
  insights (`get-customer-summary`, `get-metadata-schema`), write tools

Migration rule: once a list/write operation exists in the catalog and is
reachable via `search-tools` → `call-api`, delete its dedicated
`registerTool`. First implementation may land catalog + always-on tools while
still registering current list tools, then delete duplicates in a follow-up
commit in the same plan.

## Prefix → get-by-id map

Validated against live prod listing + standard `GET /{resource}/{id}` paths.
Treat as the source of truth for `lookup` mode 1:

| Resource | Endpoint | Prefix |
|----------|----------|--------|
| accounts | `GET /accounts/{id}` | `ACC-` |
| subscriptions | `GET /subscriptions/{id}` | `SUB-` |
| invoices | `GET /invoices/{id}` | `INV-` |
| payments | `GET /payments/{id}` | `PAY-` |
| receipts | `GET /receipts/{id}` | `REC-` |
| credit-notes | `GET /credit-notes/{id}` | `CDT-` |
| products | `GET /products/{id}` | `PRO-` |
| product-rate-plans | `GET /product-rate-plans/{id}` | `PRP-` |
| profiles | `GET /profiles/{id}` | `PRF-` |
| payment-methods | `GET /payment-methods/{id}` | `PMD-` |
| coupons | `GET /coupons/{id}` | `COU-` (confirm code vs `COU-` id on first call; if code-only, document fallback) |
| organizations | `GET /organizations/{id}` | `ORG-` |
| permissions | `GET /permissions/{id}` | `PER-` |
| roles | `GET /roles/{id}` | `ROL-` |
| pricing-components | `GET /pricing-components/{id}` | `PCO-` |
| taxation-strategies | `GET /taxation-strategies/{id}` | `TAX-` |
| units-of-measure | `GET /units-of-measure/{id}` | `UOM-` |

**No prefix (require `resource` on `lookup`):** amendments, configurations,
coupon-definitions / instances / books / book-definitions / modifiers / rules,
dunning-lines, taxation-links, users, webhooks, synchConfigs, synchJobs,
notifications, audit-logs.

**Not get-by-id:** `ADD-` (embedded). Unclassified empty in scanned org:
refunds, charges, clients, emails, email-providers, email-subscriptions,
periods, pricing-component-tiers/values, metadata, vaulted-gateways,
cybersource-tokens, usage-rounding-strategies, synchAppConfigs — include in
catalog only after a successful live probe, or mark `status: unverified`.

## Live API notes (2026-08-11 prod probe)

- `GET /search-v3?query=` returns 200 with `groupedResults` keys observed:
  `account`, `invoice`, `payment_method`, `coupon`, `plan`.
- Legacy `GET /search/{query-string}` returns 404 in this org — do not use.
- `search-v3` does **not** surface credit notes; use prefix `CDT-` →
  `/credit-notes/{id}`.
- Global `GET /credit-notes` exists and returns `CDT-…` ids (contrary to older
  SDK docs that only listed scoped paths).

## Error handling

- Unknown prefix → `isError` with the known prefix list and a hint to pass
  `resource` or use `search-tools`.
- Prefixed get 404 → return Billforward error body; do not silently fall
  through to search-v3 (avoids confusing fuzzy matches for typo’d IDs).
- Readonly write via `call-api` → existing `getClient(..., { write: true })`
  instructional error.
- Catalog miss on `describe-tool` / `call-api` → `isError` naming the missing
  entry.

## Testing

One small check file (ponytail: no fixture framework beyond vitest already in
repo):

- Prefix map: `CDT-…` → `/credit-notes/…`, `PAY-…` → `/payments/…`, email →
  `/search-v3`.
- Unknown prefix / UUID without `resource` → error.
- `call-api` write blocked when env readonly.
- `search-tools` finds `credit-notes` catalog entries by keyword.

Mock axios as existing tests do; no live network in CI.

## Rollout

1. Land catalog + five always-on tools + `lookup` prefix map.
2. Delete replaced get-by-* / old `search` implementation.
3. Move remaining `list-*` / writes into catalog; delete duplicate MCP tools.
4. Expand catalog with scoped GETs (`/credit-notes/account/{id}`, etc.) and
   unverified resources as they are probed.

## Success criteria

- `lookup query=CDT-…` returns the credit note without a dedicated tool.
- `lookup query=email|company` uses only `/search-v3`.
- `tools/list` stays on the order of ~5 discovery tools (+ temporary leftovers
  until migration finishes), not hundreds of per-endpoint tools.
- Full API reachability is via catalog search + `call-api`, not via new
  one-off `registerTool`s per endpoint.
