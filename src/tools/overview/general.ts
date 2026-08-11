import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient, environmentParam } from "../../billforward.js";
import { resolveEnvironments } from "../../config.js";

export function registerGeneralTools(server: McpServer) {
  server.registerTool(
    "help",
    {
      description: "Get concise developer guidance on available Billforward MCP tools and entities. Use this if you are unsure which tool to use."
    },
    async () => {
      try {
        const configured = [...resolveEnvironments().entries()];
        const environmentStatus = configured.length
          ? configured
              .map(
                ([name, config]) =>
                  `${name}: ${config.type}, ${config.readonly ? "read-only" : "write-enabled"}`,
              )
              .join("\n")
          : "No Billforward environment is configured yet.";
        const choiceHint =
          configured.length > 1
            ? "\nPass `environment` on each tool call to choose one."
            : "";

        const helpText = `
# Billforward MCP - Developer Guide

## Always-on discovery tools
- **\`lookup\`**: Prefixed ID (\`ACC-\`, \`CDT-\`, …) → GET by id; email/free text → \`/search-v3\`. Pass \`resource=\` for UUID-only entities.
- **\`search-tools\`**: Keyword search over the API catalog → matching operation names.
- **\`describe-tool\`**: Full schema for one catalog entry (method, path, params).
- **\`call-api\`**: Execute a catalog entry by name. Writes need a write-enabled environment.
- **\`help\`**, **\`get-me\`**: This guide and credential check.

## Workflow
1. **Find something**: \`lookup query="email or ACC-…"\` for IDs and text search.
2. **List or write anything else**: \`search-tools\` → \`describe-tool\` → \`call-api\`.
3. **Metadata cheat sheet**: \`get-metadata-schema\` for custom field keys.
4. **Customer 360**: \`get-customer-summary query="email/ID"\`.

## Convenience tools (not in catalog)
- **Accounts**: \`find-accounts\`, \`get-account-history\`
- **Insights**: \`get-customer-summary\`, \`get-metadata-schema\`

## Tips
- List/write ops (\`list-accounts\`, \`list-payments\`, \`create-account\`, …): \`search-tools\` → \`describe-tool\` → \`call-api\`.
- Metadata filters: \`call-api name="list-accounts" args={"meta.<key>":"<value>"}\` or \`find-accounts\` → \`meta.<key>=<value>\`. \`lookup\` does not support metadata syntax.
- Invoice metadata: \`lookup\` with an invoice ID, or \`call-api\` on \`/invoices/{id}/metadata\` once in catalog.
- Time filters: catalog \`list-accounts\` supports \`created_after\`/\`created_before\`. \`list-invoices\`/\`list-subscriptions\` use \`period_start_after\`/\`period_start_before\`.

## Configured Environments
${environmentStatus}${choiceHint}
      `.trim();

        return { content: [{ type: "text", text: helpText }] };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Billforward configuration error: ${error.message}` }],
        };
      }
    }
  );

  server.registerTool(
    "get-me",
    {
      description: "Validate API credentials and get information about the authenticated user/organization.",
      inputSchema: { ...environmentParam }
    },
    async ({ environment }) => {
      try {
        const client = getClient(environment);
        const response = await client.get("/organizations/mine");
        return {
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }]
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error fetching /organizations/mine: ${error.message}` }]
        };
      }
    }
  );
}
