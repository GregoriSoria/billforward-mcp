import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { bfClient } from "../../billforward.js";

export function registerSearchTools(server: McpServer) {
  server.registerTool(
    "search",
    {
      description: "Perform a lightweight unified search across Accounts, Subscriptions, and Invoices. Automatically detects emails, IDs, or falls back to metadata/name filtering.",
      inputSchema: {
        query: z.string().describe("The search term (email, name, ID, or metadata value)"),
        limit: z.number().optional().default(5).describe("Max results per category (default 5)")
      }
    },
    async ({ query, limit }) => {
      try {
        const results: any = {
          accounts: [],
          subscriptions: [],
          invoices: []
        };

        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query);
        const isAccId = /^ACC-[A-Z0-9-]+$/.test(query);
        const isSubId = /^SUB-[A-Z0-9-]+$/.test(query);
        const isInvId = /^INV-[A-Z0-9-]+$/.test(query);

        const tasks = [];

        // 1. Account Search Logic
        if (isEmail) {
          tasks.push(
            bfClient.get(`/accounts/email/${query}`)
              .then(res => results.accounts.push(res.data.results[0]))
              .catch(() => {})
          );
        } else if (isAccId) {
          tasks.push(
            bfClient.get(`/accounts/${query}`)
              .then(res => results.accounts.push(res.data.results[0]))
              .catch(() => {})
          );
        } else {
          // Standard metadata/name scan
          tasks.push(
            bfClient.get("/accounts", { params: { records: limit, filter: query } })
              .then(res => results.accounts.push(...(res.data.results || [])))
              .catch(() => {})
          );
        }

        // 2. Subscription Search Logic (Metadata focus)
        if (isSubId) {
          tasks.push(
            bfClient.get(`/subscriptions/${query}`)
              .then(res => results.subscriptions.push(res.data.results[0]))
              .catch(() => {})
          );
        } else {
          // Cross-reference: If we find an account, we usually want its subs
          // But for "Unified Search", we also check metadata directly
          tasks.push(
            bfClient.get("/subscriptions", { params: { records: limit, filter: query } })
              .then(res => results.subscriptions.push(...(res.data.results || [])))
              .catch(() => {})
          );
        }

        // 3. Invoice Search Logic
        // Billforward doesn't embed invoice metadata in the base payload (unlike accounts/subscriptions),
        // so a direct ID match also fetches the dedicated metadata sub-resource and merges it in.
        if (isInvId) {
          tasks.push(
            Promise.all([
              bfClient.get(`/invoices/${query}`),
              bfClient.get(`/invoices/${query}/metadata`).catch(() => null)
            ])
              .then(([res, metaRes]) => {
                const invoice = res.data.results[0];
                if (invoice) invoice.metadata = metaRes?.data || {};
                results.invoices.push(invoice);
              })
              .catch(() => {})
          );
        } else {
          tasks.push(
            bfClient.get("/invoices", { params: { records: limit, filter: query } })
              .then(res => results.invoices.push(...(res.data.results || [])))
              .catch(() => {})
          );
        }

        // Wait for all parallel probes
        await Promise.all(tasks);

        // Cleanup empty results
        const output = {
          accounts: (results.accounts || []).filter(Boolean),
          subscriptions: (results.subscriptions || []).filter(Boolean),
          invoices: (results.invoices || []).filter(Boolean)
        };

        return {
          content: [{ type: "text", text: JSON.stringify(output, null, 2) }]
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Search failed: ${error.message}` }]
        };
      }
    }
  );
}
