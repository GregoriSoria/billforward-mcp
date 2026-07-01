import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { bfClient } from "../../billforward.js";
import { MAX_RECORDS_LIMIT, DEFAULT_RECORDS_LIMIT } from "../../config.js";

export function registerInvoiceTools(server: McpServer, isReadOnly: boolean) {
  server.registerTool(
    "list-invoices",
    {
      description: "List all invoices with pagination and sorting. Invoices represent a request for payment for a period of service. Note: Billforward has no native filter on invoice creation date — period_start_after/period_start_before filter by the invoice's billing period start instead.",
      inputSchema: {
        limit: z.number().optional().default(DEFAULT_RECORDS_LIMIT).describe(`Number of records to return (Hard Max: ${MAX_RECORDS_LIMIT})`),
        offset: z.number().optional().default(0).describe("Number of records to skip for pagination"),
        orderBy: z.string().optional().default("created").describe("Field to order by (e.g., 'created', 'invoiceCost')"),
        orderDirection: z.enum(["ASC", "DESC"]).optional().default("DESC").describe("Direction of sorting"),
        period_start_after: z.string().optional().describe("Filter invoices whose billing period started after this ISO date (e.g. '2025-09-04T00:00:00')"),
        period_start_before: z.string().optional().describe("Filter invoices whose billing period started before this ISO date"),
        includeMetadata: z.boolean().optional().default(false).describe("Fetch and attach each invoice's metadata object. Billforward does not embed invoice metadata in the list payload, so this costs one extra API call per returned invoice — keep 'limit' small when enabling this.")
      }
    },
    async ({ limit, offset, orderBy, orderDirection, period_start_after, period_start_before, includeMetadata }) => {
      try {
        const safeLimit = Math.min(limit, MAX_RECORDS_LIMIT);
        const sharedParams = { records: safeLimit, offset, order_by: orderBy, order: orderDirection };

        const response = (period_start_after || period_start_before)
          ? await bfClient.get(
              `/invoices/period-start/${encodeURIComponent(period_start_after || "1970-01-01T00:00:00")}/${encodeURIComponent(period_start_before || "2100-01-01T00:00:00")}`,
              { params: sharedParams }
            )
          : await bfClient.get("/invoices", { params: sharedParams });

        if (includeMetadata && response.data.results?.length) {
          await Promise.all(response.data.results.map(async (invoice: any) => {
            invoice.metadata = await bfClient.get(`/invoices/${invoice.id}/metadata`)
              .then(res => res.data)
              .catch(() => ({}));
          }));
        }

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
      description: "Get full details for a specific invoice. Includes line items, taxes, payment status, and metadata (Billforward does not embed invoice metadata in the base invoice payload, so it is fetched from the dedicated /invoices/{id}/metadata endpoint and merged in).",
      inputSchema: {
        invoiceId: z.string().describe("The unique UUID of the invoice (e.g., 'INV-XXXX-XXXX')")
      }
    },
    async ({ invoiceId }) => {
      try {
        const [invoiceResponse, metadataResponse] = await Promise.all([
          bfClient.get(`/invoices/${invoiceId}`),
          bfClient.get(`/invoices/${invoiceId}/metadata`).catch(() => null)
        ]);

        const invoice = invoiceResponse.data?.results?.[0];
        if (invoice) {
          invoice.metadata = metadataResponse?.data || {};
        }

        return {
          content: [{ type: "text", text: JSON.stringify(invoiceResponse.data, null, 2) }]
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
