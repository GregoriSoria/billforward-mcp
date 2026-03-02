import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { bfClient } from "../../billforward.js";

export function registerChargeTools(server: McpServer, isReadOnly: boolean) {
  if (!isReadOnly) {
    server.registerTool(
      "create-charge",
      {
        description: "Create a one-off charge for an account. Useful for setup fees, ad-hoc billing, etc.",
        inputSchema: {
          accountId: z.string().describe("The UUID of the account to charge"),
          name: z.string().describe("Name/Description of the charge"),
          description: z.string().optional().describe("Detailed description of the charge"),
          amount: z.number().describe("The monetary amount of the charge (e.g., 50.00)"),
          currency: z.string().default("USD").describe("The ISO 4217 Currency Code"),
          invoicingType: z.enum(["Aggregated", "Immediate"]).default("Aggregated").describe("How the charge is invoiced. 'Aggregated' adds to next regular invoice, 'Immediate' generates an invoice right away.")
        }
      },
      async ({ accountId, name, description, amount, currency, invoicingType }) => {
        try {
          const response = await bfClient.post("/charges", {
            accountId,
            name,
            description,
            amount,
            currency,
            invoicingType
          });
          return {
            content: [{ type: "text", text: `Charge created successfully:\n${JSON.stringify(response.data, null, 2)}` }]
          };
        } catch (error: any) {
          return {
            isError: true,
            content: [{ type: "text", text: `Error creating charge: ${error.message}` }]
          };
        }
      }
    );
  }
}
