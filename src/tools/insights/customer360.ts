import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient, environmentParam } from "../../billforward.js";
import { readResource } from "../read-diagnostics.js";

export function metadataSchemaUsageTip() {
  return "Use exact metadata filters as meta.<key>=<value> with list-accounts or find-accounts. Use lookup for email/ID search; it does not support metadata query syntax. Invoice metadata isn't embedded by default — pass includeMetadata=true to list-invoices, or use lookup with an invoice ID, to fetch it.";
}

export function registerInsightTools(server: McpServer) {
  server.registerTool(
    "get-customer-summary",
    {
      description: "Provides a 360-degree view of a customer. Combines account details, active subscriptions, credit balances, and recent invoice history into one compact dashboard. Use this for quick context before troubleshooting or churn analysis.",
      inputSchema: {
        ...environmentParam,
        query: z.string().describe("Email or Account ID (ACC-XXXX)")
      }
    },
    async ({ environment, query }) => {
      try {
        const client = getClient(environment);
        let accountId = query;
        const resolutionReads: Awaited<ReturnType<typeof readResource>>[] = [];

        // If it looks like an email, find account first
        if (query.includes("@")) {
          const accountByEmail = await readResource(client, "accounts", `/accounts/email/${query}`);
          resolutionReads.push(accountByEmail);
          if (accountByEmail.error) {
             return { content: [{ type: "text", text: JSON.stringify({ diagnostics: resolutionReads.map((read) => read.diagnostic), errors: [accountByEmail.error] }, null, 2) }] };
          }
          if ((accountByEmail.data as any).results?.length) {
             accountId = (accountByEmail.data as any).results[0].id;
          } else {
             return { content: [{ type: "text", text: `Customer with email ${query} not found.` }] };
          }
        }

        // Fetch the documented account-scoped resources in parallel.
        const [account, subs, invoices] = await Promise.all([
           readResource(client, "account", `/accounts/${accountId}`),
           readResource(client, "subscriptions", `/subscriptions/account/${accountId}`, { records: 50, order_by: "created", order: "DESC" }),
           readResource(client, "invoices", `/accounts/${accountId}/invoices`, { records: 5, order_by: "created", order: "DESC" })
        ]);
        if (account.error) {
          return { content: [{ type: "text", text: JSON.stringify({
            diagnostics: [...resolutionReads, account, subs, invoices].map((read) => read.diagnostic),
            errors: [...resolutionReads, account, subs, invoices].flatMap((read) => read.error ? [read.error] : []),
          }, null, 2) }] };
        }
        const accountRecord = (account.data as any).results?.[0];

        const summary = {
          account: {
            id: accountRecord.id,
            name: `${accountRecord.profile.firstName} ${accountRecord.profile.lastName}`,
            company: accountRecord.profile.companyName,
            created: accountRecord.created,
            metadata: accountRecord.metadata
          },
          subscriptions: subs.error ? [] : (subs.data as any).results.map((s: any) => ({
            id: s.id,
            name: s.name,
            state: s.state,
            currentPeriodEnd: s.currentPeriodEnd,
            dunning: s.dunning
          })),
          recentInvoices: invoices.error ? [] : (invoices.data as any).results.map((i: any) => ({
            id: i.id,
            cost: i.totalCost,
            currency: i.currency,
            state: i.state,
            created: i.created
          })),
          diagnostics: [...resolutionReads, account, subs, invoices].map((read) => read.diagnostic),
          errors: [...resolutionReads, account, subs, invoices].flatMap((read) => read.error ? [read.error] : [])
        };

        return {
          content: [{ type: "text", text: JSON.stringify(summary, null, 2) }]
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error generating customer summary: ${error.message}` }]
        };
      }
    }
  );

  server.registerTool(
    "get-metadata-schema",
    {
      description: "Analyzes recently used metadata keys across Accounts, Subscriptions, and Invoices to provide a 'cheat sheet' of available custom fields (e.g., salesforce_account_id, duns, payment_gateway_url). Use this to discover how to filter using the 'metadata' parameter.",
      inputSchema: { ...environmentParam }
    },
    async ({ environment }) => {
      try {
        const client = getClient(environment);
        // Sample last 50 accounts and subscriptions (metadata is embedded directly in these list payloads)
        const [accounts, subs, invoices] = await Promise.all([
          client.get("/accounts", { params: { records: 50, order_by: "created", order: "DESC" } }),
          client.get("/subscriptions", { params: { records: 50, order_by: "created", order: "DESC" } }),
          client.get("/invoices", { params: { records: 20, order_by: "created", order: "DESC" } })
        ]);

        const accountKeys = new Set<string>();
        const subKeys = new Set<string>();
        const invoiceKeys = new Set<string>();

        accounts.data.results.forEach((a: any) => {
          if (a.metadata) Object.keys(a.metadata).forEach(k => accountKeys.add(k));
        });

        subs.data.results.forEach((s: any) => {
          if (s.metadata) Object.keys(s.metadata).forEach(k => subKeys.add(k));
        });

        // Invoices don't embed metadata in the list payload, so each one needs its own
        // /invoices/{id}/metadata call. Sample size is smaller (20 vs 50) to limit the extra round-trips.
        const invoiceMetadata = await Promise.all(invoices.data.results.map((inv: any) =>
          readResource(client, "invoice-metadata", `/invoices/${inv.id}/metadata`)
        ));
        invoiceMetadata.forEach((metadata) => {
          if (!metadata.error) Object.keys(metadata.data || {}).forEach(k => invoiceKeys.add(k));
        });

        const schema = {
          accountMetadataKeys: Array.from(accountKeys),
          subscriptionMetadataKeys: Array.from(subKeys),
          invoiceMetadataKeys: Array.from(invoiceKeys),
          usageTip: metadataSchemaUsageTip(),
          diagnostics: invoiceMetadata.map((metadata) => metadata.diagnostic),
          errors: invoiceMetadata.flatMap((metadata) => metadata.error ? [metadata.error] : [])
        };

        return {
          content: [{ type: "text", text: JSON.stringify(schema, null, 2) }]
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error discovering metadata schema: ${error.message}` }]
        };
      }
    }
  );
}
