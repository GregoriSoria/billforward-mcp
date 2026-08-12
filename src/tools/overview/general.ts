import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient, environmentParam } from "../../billforward.js";
import { resolveEnvironments } from "../../config.js";

export function registerGeneralTools(server: McpServer) {
  server.registerTool(
    "help",
    {
      description:
        "Short guide: which Billforward MCP tool to use (lookup vs catalog vs customer summary) and configured environments.",
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
            ? "\nOmit `environment` to default to the first sandbox (never production). " +
              "Pass `environment=sandbox` as an alias for that sandbox, or an exact name (dev/staging/prod)."
            : "";

        const helpText = `
# Billforward MCP - Developer Guide

## Always-on discovery tools
- **\`lookup\`**: Prefer for prefixed IDs (\`ACC-\`, \`CDT-\`, \`PAY-\`, …) OR free text (company/hotel name, email) via \`/search-v3\`.
- **\`search-tools\`** → **\`describe-tool\`** → **\`call-api\`**: Lists/writes and anything without an always-on tool (payments, credit-notes-by-account, …).
- **\`help\`**, **\`get-me\`**: This guide and credential check.

## Workflow
1. **ID or name search**: \`lookup\` (not \`find-accounts\` for company names).
2. **List/write**: \`search-tools\` → \`call-api\` (describe-tool if you need params).
3. **Active sub / dunning**: \`get-customer-summary\` by email or ACC- (not credit-note or payment lists).
4. **Metadata keys**: \`get-metadata-schema\`.

## Convenience tools (not in catalog)
- **\`find-accounts\`**: exact ID, email, or metadata only — not company names.
- **\`get-account-history\`**: account + subs + invoices — no credit notes/payments.
- **\`get-customer-summary\`**: 360 dashboard — no credit-note/payment lists.

## Tips
- Prefix map: \`CDT-\` credit note, \`PAY-\` payment, \`REC-\` receipt, \`INV-\` invoice, \`SUB-\` subscription, \`ACC-\` account.
- "Sandbox" in chat ≠ env name; omit \`environment\` or pass \`sandbox\`/\`dev\`.
- Metadata: \`find-accounts\` or \`call-api list-accounts\` with \`meta.<key>\`. \`lookup\` has no metadata filters.

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
