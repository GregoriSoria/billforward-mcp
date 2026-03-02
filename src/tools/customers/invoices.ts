import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { bfClient } from "../../billforward.js";

export function registerInvoiceTools(server: McpServer, isReadOnly: boolean) {
  server.registerTool(
    "list-invoices",
    {
      description: "List all invoices with pagination and sorting. Invoices represent a request for payment for a period of service.",
      inputSchema: {
        limit: z.number().optional().default(10).describe("Number of records to return (Hard Max: 200)"),
        offset: z.number().optional().default(0).describe("Number of records to skip for pagination"),
        orderBy: z.string().optional().default("created").describe("Field to order by (e.g., 'created', 'invoiceCost')"),
        orderDirection: z.enum(["ASC", "DESC"]).optional().default("DESC").describe("Direction of sorting"),
        created_after: z.string().optional().describe("Filter records created after this ISO date"),
        created_before: z.string().optional().describe("Filter records created before this ISO date")
      }
    },
    async ({ limit, offset, orderBy, orderDirection, created_after, created_before }) => {
      try {
        const safeLimit = Math.min(limit, 200);
        const response = await bfClient.get("/invoices", { 
          params: { 
            records: safeLimit, 
            offset,
            orderBy,
            orderDirection,
            created_after,
            created_before
          } 
        });
        return {
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }]
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error listing invoices: ${error.message}` }]
        };
      }
    }
  );

  server.registerTool(
    "get-invoice",
    {
      description: "Get full details for a specific invoice. Includes line items, taxes, and payment status.",
      inputSchema: {
        invoiceId: z.string().describe("The unique UUID of the invoice (e.g., 'INV-XXXX-XXXX')")
      }
    },
    async ({ invoiceId }) => {
      try {
        const response = await bfClient.get(`/invoices/${invoiceId}`);
        return {
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }]
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error retrieving invoice ${invoiceId}: ${error.message}` }]
        };
      }
    }
  );

  if (!isReadOnly) {
    server.registerTool(
      "issue-invoice",
      {
        description: "Issue a draft invoice, transitioning it from 'Draft' to 'Unpaid' making it ready for payment collection.",
        inputSchema: {
          invoiceId: z.string().describe("The UUID of the draft invoice to issue")
        }
      },
      async ({ invoiceId }) => {
        try {
          // In Billforward, issuing an invoice is usually done by updating its state
          const response = await bfClient.put("/invoices", {
            id: invoiceId,
            state: "Unpaid"
          });
          return {
            content: [{ type: "text", text: `Invoice issued successfully:\n${JSON.stringify(response.data, null, 2)}` }]
          };
        } catch (error: any) {
          return {
            isError: true,
            content: [{ type: "text", text: `Error issuing invoice ${invoiceId}: ${error.message}` }]
          };
        }
      }
    );
  }
}
