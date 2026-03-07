import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { bfClient } from "../../billforward.js";
import { MAX_RECORDS_LIMIT, DEFAULT_RECORDS_LIMIT } from "../../config.js";

export function registerPaymentTools(server: McpServer, isReadOnly: boolean) {
  server.registerTool(
    "list-payments",
    {
      description: "List payments across all accounts with pagination and sorting. Payments are records of money received into the system.",
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
        const response = await bfClient.get("/payments", { 
          params: { records: safeLimit, offset, orderBy, orderDirection, created_after, created_before } 
        });
        return {
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }]
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
    "list-receipts",
    {
      description: "List receipts across all accounts. Receipts usually map 1-to-1 with successful payments and provide audit data.",
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
        const response = await bfClient.get("/receipts", { 
          params: { records: safeLimit, offset, orderBy, orderDirection, created_after, created_before } 
        });
        return {
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }]
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
