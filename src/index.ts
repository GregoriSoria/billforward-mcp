#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkgPath = path.resolve(__dirname, "../package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

// Initialize the MCP server
const server = new McpServer({
  name: "Billforward",
  version: pkg.version,
});

import { registerGeneralTools } from "./tools/overview/general.js";

// --- Diagnostic & Guidance Tools ---
registerGeneralTools(server);

import { registerAccountTools } from "./tools/customers/accounts.js";
import { registerSubscriptionTools } from "./tools/customers/subscriptions.js";
import { registerInvoiceTools } from "./tools/customers/invoices.js";
import { registerPaymentTools } from "./tools/customers/payments.js";
import { registerChargeTools } from "./tools/customers/charges.js";
import { registerPlanTools } from "./tools/pricing/plans.js";
import { registerCatalogTools } from "./tools/discovery/catalog-tools.js";
import { registerLookupTools } from "./tools/discovery/lookup.js";
import { registerInsightTools } from "./tools/insights/customer360.js";

// --- Domain Tools Registration ---
registerAccountTools(server);
registerSubscriptionTools(server);
registerInvoiceTools(server);
registerPaymentTools(server);
registerChargeTools(server);
registerPlanTools(server);
registerLookupTools(server);
registerCatalogTools(server);
registerInsightTools(server);

// Main function to initialize the stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(() => {
  process.exit(1);
});
