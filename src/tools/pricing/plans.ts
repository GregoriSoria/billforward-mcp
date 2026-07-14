import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient, environmentParam } from "../../billforward.js";
import { MAX_RECORDS_LIMIT, DEFAULT_RECORDS_LIMIT } from "../../config.js";

export function registerPlanTools(server: McpServer, isReadOnly: boolean) {
  server.registerTool(
    "list-products",
    {
      description: "List all products in the catalog. Products are the highest level of the billing hierarchy.",
      inputSchema: {
        ...environmentParam,
        limit: z.number().optional().default(10).describe(`Number of records to return (Hard Max: ${MAX_RECORDS_LIMIT})`),
        offset: z.number().optional().default(0).describe("Number of records to skip"),
        orderBy: z.string().optional().default("created").describe("Field to order by"),
        orderDirection: z.enum(["ASC", "DESC"]).optional().default("DESC").describe("Direction of sorting")
      }
    },
    async ({ environment, limit, offset, orderBy, orderDirection }) => {
      try {
        const client = getClient(environment);
        const safeLimit = Math.min(limit, MAX_RECORDS_LIMIT);
        const response = await client.get("/products", {
          params: { records: safeLimit, offset, order_by: orderBy, order: orderDirection }
        });
        return {
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }]
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error listing products: ${error.message}` }]
        };
      }
    }
  );

  server.registerTool(
    "list-product-rate-plans",
    {
      description: "List all product rate plans. Rate plans define the pricing and logic for a product subscription.",
      inputSchema: {
        ...environmentParam,
        limit: z.number().optional().default(10).describe(`Number of records to return (Hard Max: ${MAX_RECORDS_LIMIT})`),
        offset: z.number().optional().default(0).describe("Number of records to skip"),
        orderBy: z.string().optional().default("created").describe("Field to order by"),
        orderDirection: z.enum(["ASC", "DESC"]).optional().default("DESC").describe("Direction of sorting")
      }
    },
    async ({ environment, limit, offset, orderBy, orderDirection }) => {
      try {
        const client = getClient(environment);
        const safeLimit = Math.min(limit, MAX_RECORDS_LIMIT);
        const response = await client.get("/product-rate-plans", {
          params: { records: safeLimit, offset, order_by: orderBy, order: orderDirection }
        });
        return {
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }]
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error listing rate plans: ${error.message}` }]
        };
      }
    }
  );

  server.registerTool(
    "get-rate-plan",
    {
      description: "Get detailed information about a specific product rate plan by ID or Data Name. This will return the full structure including pricing components and pricing tiers, essential for understanding how the plan is billed.",
      inputSchema: {
        ...environmentParam,
        ratePlanIdOrName: z.string().describe("The unique UUID or data name of the product rate plan")
      }
    },
    async ({ environment, ratePlanIdOrName }) => {
      try {
        const client = getClient(environment);
        const response = await client.get(`/product-rate-plans/${ratePlanIdOrName}`);
        return {
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }]
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error retrieving rate plan: ${error.message}` }]
        };
      }
    }
  );
}
