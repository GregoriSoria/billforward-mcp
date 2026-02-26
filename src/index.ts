#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Inicializa o servidor MCP usando a nova API McpServer
const server = new McpServer({
  name: "billforward-mcp",
  version: "0.1.0",
});

// Exemplo de como adicionar uma tool no futuro:
// server.tool("minha-tool", {}, async () => ({ content: [{ type: "text", text: "ok" }] }));

// Função principal que inicializa o transporte stdio
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Billforward MCP Server started on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
