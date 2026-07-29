# Billforward MCP Server 🚀

[![npm version](https://img.shields.io/npm/v/billforward-mcp)](https://www.npmjs.com/package/billforward-mcp)
[![npm downloads](https://img.shields.io/npm/dt/billforward-mcp)](https://www.npmjs.com/package/billforward-mcp)

A high-performance Model Context Protocol (MCP) server for integrating **Billforward's** robust billing and subscription management API with LLMs.

<a href="https://ko-fi.com/gregorisoria" target="_blank"><img height="36" style="border:0px;height:36px;" src="https://storage.ko-fi.com/cdn/kofi2.png?v=3" border="0" alt="Buy Me a Coffee at ko-fi.com" /></a>

## 🛠 Features

- **Entity Discovery**: Quickly list and inspect Accounts and Subscriptions.
- **Protocol Purity**: Zero log leakage to `stdout`, ensuring 100% reliable JSON-RPC communication.
- **Security First**: Built-in `BILLFORWARD_READ_ONLY=true` (default) mode to protect your data with instructional LLM error rejections.
- **Modern SDK**: Uses the latest `@modelcontextprotocol/sdk` signatures (`registerTool`).
- **Fully Testable**: Includes protocol compliance and unit tests via Vitest.

## 🔑 How to Get Your API Token

You need an API token to allow the MCP server to communicate with Billforward.

1. Log in to your Billforward environment.
2. Navigate to **Setup > Personal > API Keys**.
3. Create a new token and copy it.

**Quick Links:**
- 🟢 [Sandbox Environment API Keys](https://app-sandbox.billforward.net/#/setup/personal/api-keys)
- 🚀 [Production Environment API Keys](https://app.billforward.net/#/setup/personal/api-keys)

---

## ⚙️ Configuration

To run this server with **npx** (local or published):

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

Environment names are user-defined lowercase slugs. With one configured environment, tools select it automatically. With two or more, pass the exact name through the tool's `environment` parameter.

`BILLFORWARD_ENVIRONMENTS` must contain a valid JSON object encoded as a string in your MCP configuration. For named environments, omitted `readonly` means `true`; only the JSON boolean `false` enables writes. An optional absolute HTTP(S) `baseUrl` overrides the default selected by `type`.

### Advanced Environment Variables

The server behaves differently depending on these configurations:

| Variable | Default Value | Description |
|----------|---------------|-------------|
| `BILLFORWARD_SANDBOX_ACCESS_TOKEN` | _(none)_ | API token for the sandbox environment. |
| `BILLFORWARD_PRODUCTION_ACCESS_TOKEN` | _(none)_ | API token for the production environment. |
| `BILLFORWARD_ENVIRONMENTS` | _(none)_ | JSON object of named environments. Each entry requires `token` and `type`; `readonly` defaults to `true`; `baseUrl` is optional. |
| `BILLFORWARD_ACCESS_TOKEN` | _(none)_ | **Legacy** single token. Still supported; maps to the environment named by `BILLFORWARD_ENVIRONMENT` (sandbox if unset). |
| `BILLFORWARD_ENVIRONMENT` | `sandbox` | **Legacy** — only routes the legacy `BILLFORWARD_ACCESS_TOKEN`. Ignored once you use the per-environment tokens above. |
| `BILLFORWARD_READ_ONLY` | `true` | When true, POST/PUT actions return instructional error messages to the LLM preventing data mutation. |
| `BILLFORWARD_PRODUCTION_URL` | `https://app.billforward.net/v1/` | Base URL used when environment is production. |
| `BILLFORWARD_SANDBOX_URL` | `https://app-sandbox.billforward.net/v1/` | Base URL used when environment is sandbox. |
| `BILLFORWARD_DEFAULT_RESULTS`| `10` | The default number of results parsed per paginated tool response. |
| `BILLFORWARD_MAX_RESULTS` | `200` | The hard limit cap on how many records the LLM can ask for per tool call. |
| `BILLFORWARD_TIMEOUT` | `15000` | Fallback timeout in milliseconds before failing a stuck Axios request. |

The legacy token variables continue to create the `sandbox` and `production` environments and still use the global `BILLFORWARD_READ_ONLY` setting. They can coexist with catalog entries that use different names. Duplicate names are rejected, so do not define `sandbox` or `production` in the catalog when the corresponding legacy token is configured.


## 🧰 Available Tools

### � Search & Insights
- `search`: Exact account email/ID, subscription ID, or invoice ID lookup. A company-name query is a bounded local account-name scan; `match=contains` is approximate.
- `get-customer-summary`: 360-degree dashboard of a customer (profile, account-scoped subscriptions, recent account invoices, dunning status).
- `get-metadata-schema`: Analyzes metadata keys in use across Accounts, Subscriptions, and Invoices; apply exact account metadata filters as `meta.<key>=<value>` through `list-accounts` or `find-accounts`.

### �📖 Guidance
- `help`: Get an overview of available entities and usage patterns.
- `get-me`: Validate your connection and view profile metadata.

### 👥 Accounts
- `list-accounts`: Fetch a paginated list of accounts (`limit`, `offset`, `metadata`, `created_after`/`created_before`).
- `get-account`: Retrieve full details for a specific UUID.
- `get-account-by-email`: Find an account quickly by its exact email address.
- `get-account-history`: Reads documented account-scoped subscriptions (`/subscriptions/account/{accountId}`) and invoices (`/accounts/{accountId}/invoices`), both ordered by `created DESC` with bounded `records`/`offset`. Its payments block is unavailable because no account-scoped payments endpoint has been confirmed.

### 📝 Subscriptions
- `list-subscriptions`: Fetch a paginated list of subscriptions (`limit`, `offset`, `period_start_after`/`period_start_before` — Billforward has no native filter on subscription creation date, so this filters by billing period start instead).
- `get-subscription`: Retrieve full details for a specific UUID.

### 🧾 Invoices & Payments
- `list-invoices` / `get-invoice`: Fetch invoices and draft details. `list-invoices` supports `period_start_after`/`period_start_before` (same caveat as subscriptions — no native created-date filter exists). Unlike accounts/subscriptions, Billforward doesn't embed invoice `metadata` in the base payload — `get-invoice` always fetches it from the dedicated metadata sub-resource; `list-invoices` fetches it per-invoice only when `includeMetadata=true` is passed (adds one extra API call per invoice, so keep `limit` small).
- `list-payments` / `get-payment` / `list-receipts`: Fetch payments, a single payment by ID (including the offline payment justification text in its `description` field), and receipts. `created_after`/`created_before` are supported on the list tools but Billforward has no native date filter on these endpoints, so matches are filtered client-side after fetching sorted by `created`.

Business history and webhooks/notifications describe billing activity; they do not necessarily equal API request logs.

### 💳 Pricing & Catalog
- `list-products`: List the main product lines.
- `list-product-rate-plans`: List specific rate plans (the entities that accounts subscribe to).

## 🛡 Security

For named environments, read-only mode is configured per entry and defaults to `true`; use the JSON boolean `false` only for an environment that should allow writes. Legacy environments use `BILLFORWARD_READ_ONLY=true` by default.
If the LLM attempts to use tools like `create-account` or `update-subscription` while Read-Only is active, the operation will be blocked, and the LLM will receive a descriptive error instructing it to inform you that modifications are disabled.

## 🧪 Development

### Build
```bash
pnpm run build
```

### Test
```bash
pnpm test
```
