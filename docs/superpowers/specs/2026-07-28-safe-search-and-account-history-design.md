# Safe Search and Account History Design

## Goal

Make Billforward MCP read queries trustworthy for diagnosis: exact identifiers
remain exact, name matching never masquerades as a server-confirmed lookup, and
partial failures are visible to the caller.

## Confirmed Billforward API contracts

The authenticated API reference documents these read-only endpoints:

- `GET /accounts`: supports `id`, `meta.<key>=<value>`, `offset`, `records`,
  `orderBy`, `orderDirection`, and `returnTotalRecords`. It does not document a
  `companyName`, profile, or generic `filter` query parameter.
- `GET /accounts/{account-ID}/invoices`: account-scoped invoices with `offset`,
  `records`, `order`, `order_by`, `state`, `exclude_children`, and
  `include_retired`.
- `GET /subscriptions/account/{account-ID}`: account-scoped subscriptions with
  `offset`, `records`, `order`, `order_by`, `exclude_children`, and
  `include_retired`.

The documentation does not establish an aggregated account-history endpoint or
a payments endpoint filtered directly by account. The account invoice response
contains `invoicePayments`, but the MCP must describe any derived payment data
as invoice-linked rather than as an independently queried account payment feed.

## Search behavior

`search` gains `entity` (`accounts`, `subscriptions`, `invoices`, `all`) and
`match` (`exact`, `contains`). Its default is `all` plus `exact`.

- Exact email and recognized `ACC-*`, `SUB-*`, and `INV-*` values use their
  dedicated detail endpoints. They never use `filter`.
- Free text is only considered an account company-name candidate. It does not
  query subscriptions or invoices merely because `entity=all`.
- Company-name matching is a bounded local scan of `GET /accounts`, ordered by
  `created DESC`. A normalizer trims, lowercases, removes accents, and removes
  punctuation before comparison.
- `match=exact` returns only normalized equality and labels the result
  `match: "companyName-exact-local"`. `match=contains` may return normalized
  substring matches and labels each as `match: "companyName-contains-local"`
  and `approximate: true`.
- The scan has a fixed safety cap. Its output says `truncated: true` whenever
  the full collection was not examined. An empty exact result is therefore
  expressed as “no exact match in the scanned range”, never proof that the
  company is absent.
- `search` does not parse `key: value` syntax. Metadata remains an explicit
  object parameter on the accounts-specific tool.

## Accounts-specific lookup

Create one read-only accounts lookup tool with optional `accountId`, `email`,
and `metadata`. Inputs are mutually exclusive except that metadata may be used
alone. Metadata is sent as documented `meta.<key>=<value>` parameters.

`companyName` is intentionally not exposed as a server filter because it is not
documented. The tool description directs callers to account ID, email, or CRM /
metadata identifiers instead.

## Diagnostics and errors

Each independent read request produces a sanitized diagnostic entry:

```ts
{
  resource: "accounts" | "subscriptions" | "invoices" | "payments",
  endpoint: string,
  params: Record<string, string | number | boolean>,
  status?: number,
  durationMs: number,
  records: number,
  ids: string[],
  requestId?: string
}
```

`access_token`, authorization headers, cookies, e-mail addresses, and response
payload fields are not copied into diagnostics. Per-resource failures return an
entry in `errors` with the same safe request context and status/message. One
failure must not suppress successful resources. Request/correlation IDs are
read only from response headers when present.

## Account history

Add `get-account-history(accountId, from?, to?, limit?)`.

It retrieves the account, subscriptions, and invoices using only the confirmed
account-scoped endpoints. `limit` is capped by the existing maximum. Results are
ordered by each documented endpoint's default sortable date field when
available. `from`/`to` are local post-filters over documented date fields and
must report a limitation because the confirmed account-scoped endpoints do not
document a date-range parameter.

The response includes `account`, `subscriptions`, `invoices`, `payments`,
`pagination`, `diagnostics`, and `errors`. `payments` is an explicit
unavailable block unless an official account-scoped endpoint is confirmed during
implementation; it is never populated by a global scan.

`get-customer-summary` must also stop using generic `filter` requests. Once it
has resolved an exact account ID or e-mail, it uses the same documented
account-scoped subscription and invoice endpoints. It remains a compact view;
it does not introduce a separate global search or payment scan.

## Tests and documentation

Tests use Axios Mock Adapter and capture registered MCP handlers. They cover
exact email/IDs, exact company-name exclusion, approximate contains labels,
metadata parameter translation, independent endpoint errors, and entity
scoping. README, tool descriptions, help, and metadata guidance distinguish
exact lookup from bounded local approximate matching. They also explain that
account business history and notification/webhook events are not automatically
API request logs.

## Constraints

- GET-only Billforward traffic; no credential changes.
- No generic `filter` requests.
- No global scans for account history.
- Preserve the existing dependencies and TypeScript/Vitest stack.
