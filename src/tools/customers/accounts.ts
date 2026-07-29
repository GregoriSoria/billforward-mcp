import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient, environmentParam } from "../../billforward.js";
import { MAX_RECORDS_LIMIT, DEFAULT_RECORDS_LIMIT } from "../../config.js";
import { readResource } from "../read-diagnostics.js";

function filterHistoryDates(data: unknown, from?: string, to?: string) {
  if (!from && !to || !data || typeof data !== "object" || !Array.isArray((data as { results?: unknown }).results)) return data;
  const fromTime = from ? Date.parse(from) : -Infinity;
  const toTime = to ? Date.parse(to) : Infinity;
  return {
    ...(data as Record<string, unknown>),
    results: (data as { results: unknown[] }).results.filter((record) => {
      if (!record || typeof record !== "object") return true;
      const dates = Object.entries(record).flatMap(([key, value]) =>
        /(created|updated|date|time|start|end)$/i.test(key) && typeof value === "string"
          ? [Date.parse(value)] : []);
      return !dates.length || dates.some((date) => !Number.isNaN(date) && date >= fromTime && date <= toTime);
    }),
  };
}

export function registerAccountTools(server: McpServer, isReadOnly: boolean) {
  server.registerTool(
    "find-accounts",
    {
      description: "Find accounts using exactly one explicit lookup: account ID, exact profile email, or account metadata. A company-name lookup is intentionally not supported here.",
      inputSchema: {
        ...environmentParam,
        accountId: z.string().optional().describe("Exact account ID"),
        email: z.string().email().optional().describe("Exact account profile email"),
        metadata: z.record(z.string(), z.string()).optional().describe("Exact metadata filters. Example: {'salesforce_account_id': '001xx'}"),
        limit: z.number().int().positive().optional().default(DEFAULT_RECORDS_LIMIT).describe(`Number of records to return (Hard Max: ${MAX_RECORDS_LIMIT})`),
      },
    },
    async ({ environment, accountId, email, metadata, limit }) => {
      const filters = [accountId, email, metadata && Object.keys(metadata).length].filter(Boolean).length;
      if (filters !== 1) {
        return { isError: true, content: [{ type: "text", text: "Provide exactly one of accountId, email, or a non-empty metadata filter." }] };
      }
      try {
        const client = getClient(environment);
        const safeLimit = Math.min(limit, MAX_RECORDS_LIMIT);
        const endpoint = accountId ? `/accounts/${accountId}` : email ? `/accounts/email/${email}` : "/accounts";
        const params = metadata ? {
          records: safeLimit,
          ...Object.fromEntries(Object.entries(metadata).map(([key, value]) => [`meta.${key}`, value])),
        } : {};
        const response = await readResource(client, "accounts", endpoint, params);
        const output = { accounts: response.error ? [] : response.data, diagnostics: [response.diagnostic], errors: response.error ? [response.error] : [] };
        return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Account lookup failed: ${error.message}` }] };
      }
    },
  );

  server.registerTool(
    "get-account-history",
    {
      description: "Read one account with its account-scoped subscriptions and invoices. Payment history is unavailable because no account-scoped payments endpoint has been confirmed.",
      inputSchema: {
        ...environmentParam,
        accountId: z.string().min(1).describe("Exact account ID"),
        from: z.string().optional().describe("Optional ISO date; applied locally to returned date fields"),
        to: z.string().optional().describe("Optional ISO date; applied locally to returned date fields"),
        limit: z.number().int().positive().optional().default(DEFAULT_RECORDS_LIMIT).describe(`Number of records per history resource (Hard Max: ${MAX_RECORDS_LIMIT})`),
      },
    },
    async ({ environment, accountId, from, to, limit }) => {
      try {
        const client = getClient(environment);
        const params = { records: Math.min(limit, MAX_RECORDS_LIMIT), order_by: "created", order: "DESC" };
        const [account, subscriptions, invoices] = await Promise.all([
          readResource(client, "account", `/accounts/${accountId}`),
          readResource(client, "subscriptions", `/subscriptions/account/${accountId}`, params),
          readResource(client, "invoices", `/accounts/${accountId}/invoices`, params),
        ]);
        const reads = [account, subscriptions, invoices];
        return {
          content: [{ type: "text", text: JSON.stringify({
            account: account.error ? null : account.data,
            subscriptions: subscriptions.error ? null : filterHistoryDates(subscriptions.data, from, to),
            invoices: invoices.error ? null : filterHistoryDates(invoices.data, from, to),
            payments: { available: false, reason: "No account-scoped payments endpoint was confirmed." },
            diagnostics: reads.map((read) => read.diagnostic),
            errors: reads.flatMap((read) => read.error ? [read.error] : []),
            ...(from || to ? { limitations: ["Date bounds are applied locally only to returned date fields; results may be incomplete beyond the requested page."] } : {}),
          }, null, 2) }],
        };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Account history failed: ${error.message}` }] };
      }
    },
  );

  server.registerTool(
    "list-accounts",
    {
      description: "List merchant accounts with support for pagination, sorting, and metadata filtering. Available fields include id, crmID, userID, created, updated, and an embedded profile (email, names, address). Use metadata filtering via 'meta.key=value'.",
      inputSchema: {
        ...environmentParam,
        limit: z.number().optional().default(DEFAULT_RECORDS_LIMIT).describe(`Number of records to return (Default: ${DEFAULT_RECORDS_LIMIT}, Hard Max: ${MAX_RECORDS_LIMIT})`),
        offset: z.number().optional().default(0).describe("Number of records to skip for pagination"),
        orderBy: z.string().optional().default("created").describe("Field to order results by (e.g., 'created', 'id', 'crmID')"),
        orderDirection: z.enum(["ASC", "DESC"]).optional().default("DESC").describe("Direction of sorting"),
        metadata: z.record(z.string(), z.string()).optional().describe("Filter by account metadata. Example: {'internal_id': '123'}"),
        created_after: z.string().optional().describe("Filter records created after this ISO date (e.g. '2023-01-01T00:00:00Z')"),
        created_before: z.string().optional().describe("Filter records created before this ISO date")
      }
    },
    async ({ environment, limit, offset, orderBy, orderDirection, metadata, created_after, created_before }) => {
      try {
        const client = getClient(environment);
        const safeLimit = Math.min(limit, MAX_RECORDS_LIMIT);
        const params: any = {
          records: safeLimit,
          offset,
          order_by: orderBy,
          order: orderDirection
        };

        // Inject metadata filters with meta. prefix
        if (metadata) {
          Object.entries(metadata).forEach(([key, value]) => {
            params[`meta.${key}`] = value;
          });
        }

        const response = (created_after || created_before)
          ? await client.get(
              `/accounts/created/${encodeURIComponent(created_after || "1970-01-01T00:00:00")}/${encodeURIComponent(created_before || "2100-01-01T00:00:00")}`,
              { params }
            )
          : await client.get("/accounts", { params });

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
        ...environmentParam,
        email: z.string().email().describe("The exact email address of the account profile")
      }
    },
    async ({ environment, email }) => {
      try {
        const client = getClient(environment);
        const response = await client.get(`/accounts/email/${email}`);
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
        ...environmentParam,
        accountId: z.string().describe("The unique UUID of the account (e.g., 'ACC-XXXX-XXXX')")
      }
    },
    async ({ environment, accountId }) => {
      try {
        const client = getClient(environment);
        const response = await client.get(`/accounts/${accountId}`);
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
        ...environmentParam,
        limit: z.number().optional().default(DEFAULT_RECORDS_LIMIT).describe(`Number of records to return (Hard Max: ${MAX_RECORDS_LIMIT})`),
        offset: z.number().optional().default(0).describe("Number of records to skip")
      }
    },
    async ({ environment, limit, offset }) => {
      try {
        const client = getClient(environment);
        const safeLimit = Math.min(limit, MAX_RECORDS_LIMIT);
        const response = await client.get("/profiles", {
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
        ...environmentParam,
        profile: z.object({
          email: z.string().email().describe("Primary email address for the account"),
          firstName: z.string().describe("Legal first name"),
          lastName: z.string().describe("Legal last name")
        }).describe("The profile information for the new account")
      }
    },
    async ({ environment, profile }) => {
      if (isReadOnly) {
        return {
          isError: true,
          content: [{ type: "text", text: "This MCP server is currently running in Read-Only mode. Write operations (create/update/delete) are disabled and cannot be executed on the database. Please inform the user." }]
        };
      }
      try {
        const client = getClient(environment);
        const response = await client.post("/accounts", {
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
        ...environmentParam,
        accountId: z.string().describe("The UUID of the account to update"),
        profile: z.object({
          email: z.string().email().optional().describe("Updated email address"),
          firstName: z.string().optional().describe("Updated first name"),
          lastName: z.string().optional().describe("Updated last name")
        }).describe("The updated profile fields")
      }
    },
    async ({ environment, accountId, profile }) => {
      if (isReadOnly) {
        return {
          isError: true,
          content: [{ type: "text", text: "This MCP server is currently running in Read-Only mode. Write operations (create/update/delete) are disabled and cannot be executed on the database. Please inform the user." }]
        };
      }
      try {
        const client = getClient(environment);
        const response = await client.put("/accounts", {
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
