import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { bfClient } from "../../billforward.js";
import { MAX_RECORDS_LIMIT, DEFAULT_RECORDS_LIMIT } from "../../config.js";

// Billforward has no server-side created-date filter for /payments or /receipts (only
// /payments/csv supports a date range, and it returns CSV instead of JSON). To honor
// created_after/created_before we page through results sorted by created DESC and filter
// client-side, stopping once we've paged past created_after.
const DATE_FILTER_SCAN_PAGE_SIZE = MAX_RECORDS_LIMIT;
const DATE_FILTER_MAX_SCAN_RECORDS = 2000;

async function listFilteredByCreatedRange(
  resourcePath: string,
  { records, offset, created_after, created_before }: { records: number; offset: number; created_after?: string; created_before?: string }
) {
  const afterTime = created_after ? new Date(created_after).getTime() : -Infinity;
  const beforeTime = created_before ? new Date(created_before).getTime() : Infinity;

  const matches: any[] = [];
  let scanned = 0;
  let scanOffset = 0;
  let truncated = true;

  while (scanned < DATE_FILTER_MAX_SCAN_RECORDS) {
    const response = await bfClient.get(resourcePath, {
      params: { records: DATE_FILTER_SCAN_PAGE_SIZE, offset: scanOffset, order_by: "created", order: "DESC" }
    });
    const page: any[] = response.data?.results ?? [];
    if (page.length === 0) { truncated = false; break; }

    let pastLowerBound = false;
    for (const item of page) {
      const created = new Date(item.created).getTime();
      if (created < afterTime) { pastLowerBound = true; break; }
      if (created <= beforeTime) matches.push(item);
    }

    scanned += page.length;
    scanOffset += page.length;

    if (pastLowerBound || matches.length >= offset + records || page.length < DATE_FILTER_SCAN_PAGE_SIZE) {
      truncated = false;
      break;
    }
  }

  const pageResults = matches.slice(offset, offset + records);
  return {
    currentOffset: offset,
    recordsRequested: records,
    recordsReturned: pageResults.length,
    totalMatchedInScan: matches.length,
    results: pageResults,
    note: `Billforward has no native created-date filter for ${resourcePath}; fetched sorted by created DESC and filtered client-side (scanned ${scanned} records).` +
      (truncated ? ` Stopped at the ${DATE_FILTER_MAX_SCAN_RECORDS}-record safety cap before reaching created_after — narrow the range or increase offset if expected matches are missing.` : "")
  };
}

export function registerPaymentTools(server: McpServer, isReadOnly: boolean) {
  server.registerTool(
    "list-payments",
    {
      description: "List payments across all accounts with pagination and sorting. Payments are records of money received into the system. Note: Billforward has no native created-date filter on this endpoint — when created_after/created_before are set, results are fetched sorted by created (regardless of orderBy) and filtered client-side.",
      inputSchema: {
        limit: z.number().optional().default(10).describe(`Number of records to return (Hard Max: ${MAX_RECORDS_LIMIT})`),
        offset: z.number().optional().default(0).describe("Number of records to skip"),
        orderBy: z.string().optional().default("created").describe("Field to order by"),
        orderDirection: z.enum(["ASC", "DESC"]).optional().default("DESC").describe("Direction of sorting"),
        created_after: z.string().optional().describe("Filter records created after this ISO date"),
        created_before: z.string().optional().describe("Filter records created before this ISO date")
      }
    },
    async ({ limit, offset, orderBy, orderDirection, created_after, created_before }) => {
      try {
        const safeLimit = Math.min(limit, MAX_RECORDS_LIMIT);

        const data = (created_after || created_before)
          ? await listFilteredByCreatedRange("/payments", { records: safeLimit, offset, created_after, created_before })
          : (await bfClient.get("/payments", { params: { records: safeLimit, offset, order_by: orderBy, order: orderDirection } })).data;

        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error listing payments: ${error.message}` }]
        };
      }
    }
  );

  server.registerTool(
    "get-payment",
    {
      description: "Get full details for a specific payment by ID. Includes the offline payment justification (the 'description' field) when the payment was recorded manually rather than through a gateway.",
      inputSchema: {
        paymentId: z.string().describe("The unique UUID of the payment (e.g., 'PAY-XXXX-XXXX')")
      }
    },
    async ({ paymentId }) => {
      try {
        const response = await bfClient.get(`/payments/${paymentId}`);
        return {
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }]
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error retrieving payment ${paymentId}: ${error.message}` }]
        };
      }
    }
  );

  server.registerTool(
    "list-receipts",
    {
      description: "List receipts across all accounts. Receipts usually map 1-to-1 with successful payments and provide audit data. Note: Billforward has no native created-date filter on this endpoint — when created_after/created_before are set, results are fetched sorted by created (regardless of orderBy) and filtered client-side.",
      inputSchema: {
        limit: z.number().optional().default(10).describe(`Number of records to return (Hard Max: ${MAX_RECORDS_LIMIT})`),
        offset: z.number().optional().default(0).describe("Number of records to skip"),
        orderBy: z.string().optional().default("created").describe("Field to order by"),
        orderDirection: z.enum(["ASC", "DESC"]).optional().default("DESC").describe("Direction of sorting"),
        created_after: z.string().optional().describe("Filter records created after this ISO date"),
        created_before: z.string().optional().describe("Filter records created before this ISO date")
      }
    },
    async ({ limit, offset, orderBy, orderDirection, created_after, created_before }) => {
      try {
        const safeLimit = Math.min(limit, MAX_RECORDS_LIMIT);

        const data = (created_after || created_before)
          ? await listFilteredByCreatedRange("/receipts", { records: safeLimit, offset, created_after, created_before })
          : (await bfClient.get("/receipts", { params: { records: safeLimit, offset, order_by: orderBy, order: orderDirection } })).data;

        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error listing receipts: ${error.message}` }]
        };
      }
    }
  );
}
