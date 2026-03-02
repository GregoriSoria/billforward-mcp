import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { bfClient } from "../../billforward.js";

export function registerGeneralTools(server: McpServer) {
  server.registerTool(
    "help",
    {
      description: "Get concise developer guidance on available Billforward MCP tools and entities. Use this if you are unsure which tool to use."
    },
    async () => {
      const helpText = `
# Billforward MCP - Developer Guide

## Core Tools
- **Insights**: \`get-customer-summary\`, \`get-metadata-schema\`
- **Accounts**: \`list-accounts\`, \`get-account\`, \`get-account-by-email\`
- **Subscriptions**: \`list-subscriptions\`, \`get-subscription\`
- **Invoices**: \`list-invoices\`, \`get-invoice\`
- **Pricing**: \`list-products\`, \`list-product-rate-plans\`

## Search & Analysis Strategy
1. **Discover Metadata**: Run \`get-metadata-schema\` to see available custom fields for filtering.
2. **Fast Search**: Use \`search query="keyword"\` for general discovery.
3. **Deep Dive**: Use \`get-customer-summary query="email/ID"\` for a full 360 overview of a client.
4. **Time Filtering**: Listing tools (accounts, subs, invoices, payments) support \`created_after\` and \`created_before\` filters for temporal analysis.
5. **Technical Filter**: Use \`list-*\` tools with \`metadata\` for exact matching on custom keys.
      `.trim();

      return {
        content: [{ type: "text", text: helpText }]
      };
    }
  );

  server.registerTool(
    "get-me",
    {
      description: "Validate API credentials and get information about the authenticated user/organization."
    },
    async () => {
      try {
        const response = await bfClient.get("/me");
        return {
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }]
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error fetching /me: ${error.message}` }]
        };
      }
    }
  );
}
