import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { bfClient } from "../../billforward.js";

export function registerInsightTools(server: McpServer) {
  server.registerTool(
    "get-customer-summary",
    {
      description: "Provides a 360-degree view of a customer. Combines account details, active subscriptions, credit balances, and recent invoice history into one compact dashboard. Use this for quick context before troubleshooting or churn analysis.",
      inputSchema: {
        query: z.string().describe("Email or Account ID (ACC-XXXX)")
      }
    },
    async ({ query }) => {
      try {
        let accountId = query;
        
        // If it looks like an email, find account first
        if (query.includes("@")) {
          const accResponse = await bfClient.get(`/accounts/email/${query}`);
          if (accResponse.data.results && accResponse.data.results.length > 0) {
             accountId = accResponse.data.results[0].id;
          } else {
             return { content: [{ type: "text", text: `Customer with email ${query} not found.` }] };
          }
        }

        // Fetch multiple entities in parallel for efficiency
        const [account, subs, invoices] = await Promise.all([
           bfClient.get(`/accounts/${accountId}`),
           bfClient.get("/subscriptions", { params: { filter: accountId, records: 50 } }),
           bfClient.get("/invoices", { params: { filter: accountId, records: 5, order_by: "created", order: "DESC" } })
        ]);

        const summary = {
          account: {
            id: account.data.results[0].id,
            name: `${account.data.results[0].profile.firstName} ${account.data.results[0].profile.lastName}`,
            company: account.data.results[0].profile.companyName,
            created: account.data.results[0].created,
            metadata: account.data.results[0].metadata
          },
          subscriptions: subs.data.results.map((s: any) => ({
            id: s.id,
            name: s.name,
            state: s.state,
            currentPeriodEnd: s.currentPeriodEnd,
            dunning: s.dunning
          })),
          recentInvoices: invoices.data.results.map((i: any) => ({
            id: i.id,
            cost: i.totalCost,
            currency: i.currency,
            state: i.state,
            created: i.created
          }))
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
      description: "Analyzes recently used metadata keys across Accounts and Subscriptions to provide a 'cheat sheet' of available custom fields (e.g., salesforce_account_id, duns). Use this to discover how to filter using the 'metadata' parameter.",
      inputSchema: {}
    },
    async () => {
      try {
        // Sample last 50 accounts and subscriptions
        const [accounts, subs] = await Promise.all([
          bfClient.get("/accounts", { params: { records: 50, order_by: "created", order: "DESC" } }),
          bfClient.get("/subscriptions", { params: { records: 50, order_by: "created", order: "DESC" } })
        ]);

        const accountKeys = new Set<string>();
        const subKeys = new Set<string>();

        accounts.data.results.forEach((a: any) => {
          if (a.metadata) Object.keys(a.metadata).forEach(k => accountKeys.add(k));
        });

        subs.data.results.forEach((s: any) => {
          if (s.metadata) Object.keys(s.metadata).forEach(k => subKeys.add(k));
        });

        const schema = {
          accountMetadataKeys: Array.from(accountKeys),
          subscriptionMetadataKeys: Array.from(subKeys),
          usageTip: "You can filter list-accounts using metadata={'key': 'value'} and search query using 'key: value'."
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
