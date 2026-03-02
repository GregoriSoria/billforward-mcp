#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { bfClient } from "./billforward.js";

import { z } from "zod";

// Initialize the MCP server
const server = new McpServer({
  name: "Billforward",
  version: "1.0.1",
});

const isReadOnly = process.argv.includes('--read-only');

import { registerGeneralTools } from "./tools/overview/general.js";

// --- Diagnostic & Guidance Tools ---
registerGeneralTools(server);

import { registerAccountTools } from "./tools/customers/accounts.js";
import { registerSubscriptionTools } from "./tools/customers/subscriptions.js";
import { registerInvoiceTools } from "./tools/customers/invoices.js";
import { registerPaymentTools } from "./tools/customers/payments.js";
import { registerChargeTools } from "./tools/customers/charges.js";
import { registerPlanTools } from "./tools/pricing/plans.js";
import { registerSearchTools } from "./tools/search/unified.js";
import { registerInsightTools } from "./tools/insights/customer360.js";

// --- Domain Tools Registration ---
registerAccountTools(server, isReadOnly);
registerSubscriptionTools(server, isReadOnly);
registerInvoiceTools(server, isReadOnly);
registerPaymentTools(server, isReadOnly);
registerChargeTools(server, isReadOnly);
registerPlanTools(server, isReadOnly);
registerSearchTools(server);
registerInsightTools(server);

// Main function to initialize the stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(() => {
  process.exit(1);
});
