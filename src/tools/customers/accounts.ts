import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { bfClient } from "../../billforward.js";
import { MAX_RECORDS_LIMIT, DEFAULT_RECORDS_LIMIT } from "../../config.js";

export function registerAccountTools(server: McpServer, isReadOnly: boolean) {
  server.registerTool(
    "list-accounts",
    {
      description: "List merchant accounts with support for pagination, sorting, and metadata filtering. Available fields include id, crmID, userID, created, updated, and an embedded profile (email, names, address). Use metadata filtering via 'meta.key=value'.",
      inputSchema: {
        limit: z.number().optional().default(DEFAULT_RECORDS_LIMIT).describe(`Number of records to return (Default: ${DEFAULT_RECORDS_LIMIT}, Hard Max: ${MAX_RECORDS_LIMIT})`),
        offset: z.number().optional().default(0).describe("Number of records to skip for pagination"),
        orderBy: z.string().optional().default("created").describe("Field to order results by (e.g., 'created', 'id', 'crmID')"),
        orderDirection: z.enum(["ASC", "DESC"]).optional().default("DESC").describe("Direction of sorting"),
        metadata: z.record(z.string(), z.string()).optional().describe("Filter by account metadata. Example: {'internal_id': '123'}"),
        created_after: z.string().optional().describe("Filter records created after this ISO date (e.g. '2023-01-01T00:00:00Z')"),
        created_before: z.string().optional().describe("Filter records created before this ISO date")
      }
    },
    async ({ limit, offset, orderBy, orderDirection, metadata, created_after, created_before }) => {
      try {
        const safeLimit = Math.min(limit, MAX_RECORDS_LIMIT);
        const params: any = { 
          records: safeLimit, 
          offset,
          orderBy,
          orderDirection,
          created_after,
          created_before
        };

        // Inject metadata filters with meta. prefix
        if (metadata) {
          Object.entries(metadata).forEach(([key, value]) => {
            params[`meta.${key}`] = value;
          });
        }

        const response = await bfClient.get("/accounts", { params });
        return {
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }]
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error listing accounts: ${error.message}` }]
        };
      }
    }
  );

  server.registerTool(
    "get-account-by-email",
    {
      description: "Find an account specifically by their email address. This is the fastest way to find a customer if you have their email.",
      inputSchema: {
        email: z.string().email().describe("The exact email address of the account profile")
      }
    },
    async ({ email }) => {
      try {
        const response = await bfClient.get(`/accounts/email/${email}`);
        return {
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }]
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error finding account by email ${email}: ${error.message}` }]
        };
      }
    }
  );

  server.registerTool(
    "get-account",
    {
      description: "Get detailed information about a specific account by ID. Contains billing contact info and linked metadata.",
      inputSchema: {
        accountId: z.string().describe("The unique UUID of the account (e.g., 'ACC-XXXX-XXXX')")
      }
    },
    async ({ accountId }) => {
      try {
        const response = await bfClient.get(`/accounts/${accountId}`);
        return {
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }]
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error retrieving account ${accountId}: ${error.message}` }]
        };
      }
    }
  );

  server.registerTool(
    "list-profiles",
    {
      description: "List all account profiles. Profiles contain contact details like firstName, lastName, email, and address fields.",
      inputSchema: {
        limit: z.number().optional().default(DEFAULT_RECORDS_LIMIT).describe(`Number of records to return (Hard Max: ${MAX_RECORDS_LIMIT})`),
        offset: z.number().optional().default(0).describe("Number of records to skip")
      }
    },
    async ({ limit, offset }) => {
      try {
        const safeLimit = Math.min(limit, MAX_RECORDS_LIMIT);
        const response = await bfClient.get("/profiles", { 
          params: { records: safeLimit, offset } 
        });
        return {
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }]
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error listing profiles: ${error.message}` }]
        };
      }
    }
  );

  server.registerTool(
    "create-account",
    {
      description: "Create a new account in Billforward. This is the first step for new customers.",
      inputSchema: {
        profile: z.object({
          email: z.string().email().describe("Primary email address for the account"),
          firstName: z.string().describe("Legal first name"),
          lastName: z.string().describe("Legal last name")
        }).describe("The profile information for the new account")
      }
    },
    async ({ profile }) => {
      if (isReadOnly) {
        return {
          isError: true,
          content: [{ type: "text", text: "This MCP server is currently running in Read-Only mode. Write operations (create/update/delete) are disabled and cannot be executed on the database. Please inform the user." }]
        };
      }
      try {
        const response = await bfClient.post("/accounts", {
          profile
        });
        return {
          content: [{ type: "text", text: `Account created successfully:\n${JSON.stringify(response.data, null, 2)}` }]
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error creating account: ${error.message}` }]
        };
      }
    }
  );

  server.registerTool(
    "update-account",
    {
      description: "Update an existing account profile. Billforward uses PUT for updates, so pass all relevant profile fields.",
      inputSchema: {
        accountId: z.string().describe("The UUID of the account to update"),
        profile: z.object({
          email: z.string().email().optional().describe("Updated email address"),
          firstName: z.string().optional().describe("Updated first name"),
          lastName: z.string().optional().describe("Updated last name")
        }).describe("The updated profile fields")
      }
    },
    async ({ accountId, profile }) => {
      if (isReadOnly) {
        return {
          isError: true,
          content: [{ type: "text", text: "This MCP server is currently running in Read-Only mode. Write operations (create/update/delete) are disabled and cannot be executed on the database. Please inform the user." }]
        };
      }
      try {
        const response = await bfClient.put("/accounts", {
          id: accountId,
          profile
        });
        return {
          content: [{ type: "text", text: `Account updated successfully:\n${JSON.stringify(response.data, null, 2)}` }]
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error updating account ${accountId}: ${error.message}` }]
        };
      }
    }
  );
}
