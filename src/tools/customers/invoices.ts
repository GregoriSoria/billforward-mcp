import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient, environmentParam } from "../../billforward.js";
import { MAX_RECORDS_LIMIT, DEFAULT_RECORDS_LIMIT } from "../../config.js";
import { readResource } from "../read-diagnostics.js";

function readOutput(data: unknown, reads: Awaited<ReturnType<typeof readResource>>[]) {
  return {
    ...(data && typeof data === "object" ? data : { results: data }),
    diagnostics: reads.map((read) => read.diagnostic),
    errors: reads.flatMap((read) => read.error ? [read.error] : []),
  };
}

export function registerInvoiceTools(server: McpServer) {
  server.registerTool(
    "list-invoices",
    {
      description: "List all invoices with pagination and sorting. Invoices represent a request for payment for a period of service. Note: Billforward has no native filter on invoice creation date — period_start_after/period_start_before filter by the invoice's billing period start instead.",
      inputSchema: {
        ...environmentParam,
        limit: z.number().optional().default(DEFAULT_RECORDS_LIMIT).describe(`Number of records to return (Hard Max: ${MAX_RECORDS_LIMIT})`),
        offset: z.number().optional().default(0).describe("Number of records to skip for pagination"),
        orderBy: z.string().optional().default("created").describe("Field to order by (e.g., 'created', 'invoiceCost')"),
        orderDirection: z.enum(["ASC", "DESC"]).optional().default("DESC").describe("Direction of sorting"),
        period_start_after: z.string().optional().describe("Filter invoices whose billing period started after this ISO date (e.g. '2025-09-04T00:00:00')"),
        period_start_before: z.string().optional().describe("Filter invoices whose billing period started before this ISO date"),
        includeMetadata: z.boolean().optional().default(false).describe("Fetch and attach each invoice's metadata object. Billforward does not embed invoice metadata in the list payload, so this costs one extra API call per returned invoice — keep 'limit' small when enabling this.")
      }
    },
    async ({ environment, limit, offset, orderBy, orderDirection, period_start_after, period_start_before, includeMetadata }) => {
      try {
        const client = getClient(environment);
        const safeLimit = Math.min(limit, MAX_RECORDS_LIMIT);
        const sharedParams = { records: safeLimit, offset, order_by: orderBy, order: orderDirection };

        const response = (period_start_after || period_start_before)
          ? await client.get(
              `/invoices/period-start/${encodeURIComponent(period_start_after || "1970-01-01T00:00:00")}/${encodeURIComponent(period_start_before || "2100-01-01T00:00:00")}`,
              { params: sharedParams }
            )
          : await client.get("/invoices", { params: sharedParams });

        const metadataReads = includeMetadata && response.data.results?.length
          ? await Promise.all(response.data.results.map((invoice: any) => readResource(client, "invoice-metadata", `/invoices/${invoice.id}/metadata`)))
          : [];
        for (const [index, metadata] of metadataReads.entries()) {
          response.data.results[index].metadata = metadata.error ? {} : metadata.data;
        }

        return {
          content: [{ type: "text", text: JSON.stringify(readOutput(response.data, metadataReads), null, 2) }]
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
        ...environmentParam,
        invoiceId: z.string().describe("The unique UUID of the invoice (e.g., 'INV-XXXX-XXXX')")
      }
    },
    async ({ environment, invoiceId }) => {
      try {
        const client = getClient(environment);
        const [invoiceResponse, metadataResponse] = await Promise.all([
          readResource(client, "invoice", `/invoices/${invoiceId}`),
          readResource(client, "invoice-metadata", `/invoices/${invoiceId}/metadata`)
        ]);

        if (invoiceResponse.error) throw new Error(invoiceResponse.error.message);
        const invoice = (invoiceResponse.data as any)?.results?.[0];
        if (invoice) {
          invoice.metadata = metadataResponse.error ? {} : metadataResponse.data || {};
        }

        return {
          content: [{ type: "text", text: JSON.stringify(readOutput(invoiceResponse.data, [invoiceResponse, metadataResponse]), null, 2) }]
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error retrieving invoice ${invoiceId}: ${error.message}` }]
        };
      }
    }
  );

  server.registerTool(
      "issue-invoice",
      {
        description: "Issue a draft invoice, transitioning it from 'Draft' to 'Unpaid' making it ready for payment collection.",
        inputSchema: {
          ...environmentParam,
          invoiceId: z.string().describe("The UUID of the draft invoice to issue")
        }
      },
      async ({ environment, invoiceId }) => {
        try {
          const client = getClient(environment, { write: true });
          // In Billforward, issuing an invoice is usually done by updating its state
          const response = await client.put("/invoices", {
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
