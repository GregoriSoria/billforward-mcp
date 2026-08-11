import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { executeCatalogEntry } from "../../catalog/execute.js";
import { getCatalogEntry, searchCatalog } from "../../catalog/search.js";
import { getClient, environmentParam } from "../../billforward.js";

export function registerCatalogTools(server: McpServer) {
  server.registerTool(
    "search-tools",
    {
      description:
        "Keyword search over the Billforward API catalog. Returns matching operation names and one-line summaries. Follow with describe-tool, then call-api.",
      inputSchema: {
        query: z.string().min(1),
        limit: z.number().int().positive().optional().default(10),
      },
    },
    async ({ query, limit }) => {
      const matches = searchCatalog(query, limit).map(({ name, summary, method, path }) => ({
        name,
        summary,
        method,
        path,
      }));
      return { content: [{ type: "text", text: JSON.stringify({ matches }, null, 2) }] };
    },
  );

  server.registerTool(
    "describe-tool",
    {
      description:
        "Return the full catalog entry for one API operation (method, path template, params). Use the exact name from search-tools.",
      inputSchema: {
        name: z.string().min(1),
      },
    },
    async ({ name }) => {
      const entry = getCatalogEntry(name);
      if (!entry) {
        return { isError: true, content: [{ type: "text", text: `Unknown catalog entry: ${name}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(entry, null, 2) }] };
    },
  );

  server.registerTool(
    "call-api",
    {
      description:
        "Execute a named catalog entry. Writes require a write-enabled environment. Discover operations via search-tools and describe-tool.",
      inputSchema: {
        ...environmentParam,
        name: z.string().describe("Exact catalog entry name from search-tools / describe-tool"),
        args: z.record(z.string(), z.unknown()).optional().default({}),
      },
    },
    async ({ environment, name, args }) => {
      const entry = getCatalogEntry(name);
      if (!entry) {
        return { isError: true, content: [{ type: "text", text: `Unknown catalog entry: ${name}` }] };
      }
      try {
        const client = getClient(environment, entry.write ? { write: true } : {});
        const data = await executeCatalogEntry(client, entry, args);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: error.message }] };
      }
    },
  );
}
