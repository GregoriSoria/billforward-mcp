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

function historyPagination(data: unknown, offset: number, records: number) {
  const response = data && typeof data === "object" ? data as { results?: unknown; totalRecords?: unknown } : {};
  const returned = Array.isArray(response.results) ? response.results.length : 0;
  return {
    offset,
    records,
    returned,
    ...(typeof response.totalRecords === "number" ? { totalRecords: response.totalRecords } : {}),
  };
}

const isoDateTime = z.iso.datetime({ offset: true });

export function registerAccountTools(server: McpServer) {
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
        from: isoDateTime.optional().describe("Optional ISO datetime; applied locally to returned date fields"),
        to: isoDateTime.optional().describe("Optional ISO datetime; applied locally to returned date fields"),
        limit: z.number().int().positive().optional().default(DEFAULT_RECORDS_LIMIT).describe(`Number of records per history resource (Hard Max: ${MAX_RECORDS_LIMIT})`),
        offset: z.number().int().nonnegative().optional().default(0).describe("Number of records to skip per history resource"),
      },
    },
    async ({ environment, accountId, from, to, limit, offset }) => {
      try {
        const client = getClient(environment);
        const records = Math.min(limit, MAX_RECORDS_LIMIT);
        const safeOffset = offset ?? 0;
        const params = { records, offset: safeOffset, order_by: "created", order: "DESC" };
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
            pagination: {
              subscriptions: historyPagination(subscriptions.data, safeOffset, records),
              invoices: historyPagination(invoices.data, safeOffset, records),
            },
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
}
