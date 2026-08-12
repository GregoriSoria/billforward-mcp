import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { resolveGetById } from "../../catalog/prefixes.js";
import { getClient, environmentParam } from "../../billforward.js";
import { DEFAULT_RECORDS_LIMIT, MAX_RECORDS_LIMIT } from "../../config.js";

const PREFIXED = /^[A-Z]{2,4}-[A-Z0-9-]+$/;

export function registerLookupTools(server: McpServer) {
  server.registerTool(
    "lookup",
    {
      description:
        "Prefer this for any prefixed Billforward ID (ACC-, SUB-, INV-, PAY-, REC-, CDT-, …) or free-text search (company name, email, Hotel Mio, etc.) via /search-v3. " +
        "Do not use find-accounts for company names. Pass resource= only for UUID-only entities.",
      inputSchema: {
        ...environmentParam,
        query: z.string().min(1),
        resource: z.string().optional(),
        limit: z.number().int().positive().optional().default(DEFAULT_RECORDS_LIMIT),
        offset: z.number().int().nonnegative().optional().default(0),
      },
    },
    async ({ environment, query, resource, limit, offset }) => {
      const client = getClient(environment);
      const looksPrefixed = PREFIXED.test(query.trim());
      if (looksPrefixed || resource) {
        const resolved = resolveGetById(query, resource);
        if ("error" in resolved) {
          return { isError: true, content: [{ type: "text", text: resolved.error }] };
        }
        try {
          const response = await client.get(resolved.path);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ mode: "get-by-id", path: resolved.path, data: response.data }, null, 2),
            }],
          };
        } catch (error: any) {
          return {
            isError: true,
            content: [{ type: "text", text: `Error GET ${resolved.path}: ${error.message}` }],
          };
        }
      }
      try {
        const safeLimit = Math.min(limit, MAX_RECORDS_LIMIT);
        const response = await client.get("/search-v3", { params: { query, records: safeLimit, offset } });
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ mode: "search-v3", data: response.data }, null, 2),
          }],
        };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Error search-v3: ${error.message}` }] };
      }
    },
  );
}
