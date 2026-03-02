# Billforward MCP Server 🚀

A high-performance Model Context Protocol (MCP) server for integrating **Billforward's** robust billing and subscription management API with LLMs.

## 🛠 Features

- **Entity Discovery**: Quickly list and inspect Accounts and Subscriptions.
- **Protocol Purity**: Zero log leakage to `stdout`, ensuring 100% reliable JSON-RPC communication.
- **Security First**: Built-in `--read-only` mode to protect your data from accidental modifications.
- **Modern SDK**: Uses the latest `@modelcontextprotocol/sdk` signatures (`registerTool`).
- **Fully Testable**: Includes protocol compliance and unit tests via Vitest.

## ⚙️ Configuration

To run this server with **npx** (local or published):

```json
{
  "mcpServers": {
    "billforward": {
      "command": "npx",
      "args": [
        "-y",
        "C:/Projects/billforward-mcp", // If local or "@username/billforward-mcp" if published
        "--read-only"
      ],
      "env": {
        "BILLFORWARD_ACCESS_TOKEN": "your_private_access_token",
        "BILLFORWARD_ENVIRONMENT": "sandbox"
      }
    }
  }
}
```

*Note: Set `BILLFORWARD_ENVIRONMENT` to `"production"` when you are ready to use live data. It defaults to `"sandbox"`.*


## 🧰 Available Tools

### � Search & Insights
- `search`: Parallelized unified search across Accounts, Subscriptions, and Invoices using email, ID, or keyword.
- `get-customer-summary`: 360-degree dashboard of a customer (profile, subs, recent invoices, dunning status).
- `get-metadata-schema`: Analyzes metadata keys in use across your environment to help filter queries.

### �📖 Guidance
- `help`: Get an overview of available entities and usage patterns.
- `get-me`: Validate your connection and view profile metadata.

### 👥 Accounts
- `list-accounts`: Fetch a paginated list of accounts (`limit`, `offset`, `metadata`, `created_after`).
- `get-account`: Retrieve full details for a specific UUID.
- `get-account-by-email`: Find an account quickly by its exact email address.

### 📝 Subscriptions
- `list-subscriptions`: Fetch a paginated list of subscriptions (`limit`, `offset`, `created_after`).
- `get-subscription`: Retrieve full details for a specific UUID.

### 🧾 Invoices & Payments
- `list-invoices` / `get-invoice`: Fetch invoices and draft details.
- `list-payments` / `list-receipts`: Fetch payments and their corresponding receipts.

### 💳 Pricing & Catalog
- `list-products`: List the main product lines.
- `list-product-rate-plans`: List specific rate plans (the entities that accounts subscribe to).

## 🛡 Security

Enable **Read-Only Mode** by appending `--read-only` to the `args` array. This prevents the server from registering any tool that could potentially modify your data.

## 🧪 Development

### Build
```bash
pnpm run build
```

### Test
```bash
pnpm test
```

*Includes a special `protocol.test.ts` to ensure no third-party package ever leaks logs to the MCP stream again.*
