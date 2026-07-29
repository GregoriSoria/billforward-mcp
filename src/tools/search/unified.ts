import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient, environmentParam } from "../../billforward.js";
import { MAX_RECORDS_LIMIT } from "../../config.js";
import { normalizeCompanyName, readResource } from "../read-diagnostics.js";

const COMPANY_SCAN_PAGE_SIZE = Math.min(50, MAX_RECORDS_LIMIT);

type Entity = 'accounts' | 'subscriptions' | 'invoices' | 'all';
type Match = 'exact' | 'contains';

function isEntityRequested(entity: Entity, resource: Exclude<Entity, 'all'>) {
  return entity === 'all' || entity === resource;
}

function skipped(resource: Exclude<Entity, 'all'>, message: string) {
  return { resource, skipped: true, message };
}

function responseRecords(data: unknown): any[] {
  return data && typeof data === 'object' && Array.isArray((data as { results?: unknown }).results)
    ? (data as { results: any[] }).results
    : [];
}

async function scanCompanyNames(
  client: ReturnType<typeof getClient>,
  query: string,
  match: Match,
  limit: number,
) {
  const accounts: any[] = [];
  const diagnostics: unknown[] = [];
  const errors: unknown[] = [];
  const normalizedQuery = normalizeCompanyName(query);
  let scanned = 0;
  let offset = 0;
  let truncated = false;

  while (scanned < MAX_RECORDS_LIMIT && accounts.length < limit) {
    const records = Math.min(COMPANY_SCAN_PAGE_SIZE, MAX_RECORDS_LIMIT - scanned);
    const response = await readResource(client, 'accounts', '/accounts', {
      records,
      offset,
      order_by: 'created',
      order: 'DESC',
    });
    diagnostics.push(response.diagnostic);
    if (response.error) {
      errors.push(response.error);
      break;
    }

    const page = responseRecords(response.data);
    scanned += page.length;
    offset += page.length;
    const totalRecords = response.data && typeof response.data === 'object'
      ? (response.data as { totalRecords?: unknown }).totalRecords
      : undefined;
    if (typeof totalRecords === 'number' && totalRecords > scanned) truncated = true;

    for (const account of page) {
      const companyName = account?.profile?.companyName;
      if (typeof companyName !== 'string') continue;
      const normalizedCompanyName = normalizeCompanyName(companyName);
      const matched = match === 'exact'
        ? normalizedCompanyName === normalizedQuery
        : normalizedCompanyName.includes(normalizedQuery);
      if (matched) {
        accounts.push({
          ...account,
          match: match === 'exact' ? 'companyName-exact-local' : 'companyName-contains-local',
          ...(match === 'contains' ? { approximate: true } : {}),
        });
      }
      if (accounts.length === limit) break;
    }

    if (page.length < records) break;
    if (scanned === MAX_RECORDS_LIMIT) truncated = true;
  }

  return { accounts, diagnostics, errors, truncated };
}

export function registerSearchTools(server: McpServer) {
  server.registerTool(
    "search",
    {
      description: "Find exact Billforward account email/ID, subscription ID, or invoice ID. Free text is a bounded local account company-name scan; use match=contains only when an approximate company-name match is intended.",
      inputSchema: {
        ...environmentParam,
        query: z.string().describe("Exact email or ID, or a company name to scan locally"),
        entity: z.enum(['accounts', 'subscriptions', 'invoices', 'all']).default('all'),
        match: z.enum(['exact', 'contains']).default('exact'),
        limit: z.number().optional().default(5).describe("Max returned records (default 5)"),
      },
    },
    async ({ environment, query, entity, match, limit }) => {
      try {
        const client = getClient(environment);
        const safeLimit = Math.min(limit, MAX_RECORDS_LIMIT);
        const output: {
          accounts: any[];
          subscriptions: any[];
          invoices: any[];
          diagnostics: unknown[];
          errors: unknown[];
          truncated: boolean;
        } = { accounts: [], subscriptions: [], invoices: [], diagnostics: [], errors: [], truncated: false };
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query);
        const resource = /^ACC-[A-Z0-9-]+$/.test(query) ? 'accounts'
          : /^SUB-[A-Z0-9-]+$/.test(query) ? 'subscriptions'
          : /^INV-[A-Z0-9-]+$/.test(query) ? 'invoices'
          : undefined;

        if (isEmail) {
          if (isEntityRequested(entity, 'accounts')) {
            const response = await readResource(client, 'accounts', `/accounts/email/${query}`);
            output.diagnostics.push(response.diagnostic);
            if (response.error) output.errors.push(response.error);
            else output.accounts.push(...responseRecords(response.data).slice(0, safeLimit));
          } else {
            output.diagnostics.push(skipped('accounts', 'Exact email lookups apply only to accounts.'));
          }
        } else if (resource) {
          if (isEntityRequested(entity, resource)) {
            const response = await readResource(client, resource, `/${resource}/${query}`);
            output.diagnostics.push(response.diagnostic);
            if (response.error) output.errors.push(response.error);
            else output[resource].push(...responseRecords(response.data).slice(0, safeLimit));
          } else {
            output.diagnostics.push(skipped(resource, `The exact ID belongs to ${resource}, which was not requested.`));
          }
        } else if (isEntityRequested(entity, 'accounts')) {
          const scanned = await scanCompanyNames(client, query, match, safeLimit);
          output.accounts.push(...scanned.accounts);
          output.diagnostics.push(...scanned.diagnostics);
          output.errors.push(...scanned.errors);
          output.truncated = scanned.truncated;
          if (entity === 'all') {
            output.diagnostics.push(skipped('subscriptions', 'Free text is only supported as a local account company-name scan.'));
            output.diagnostics.push(skipped('invoices', 'Free text is only supported as a local account company-name scan.'));
          }
        } else {
          output.diagnostics.push(skipped(entity as Exclude<Entity, 'all'>, 'Free text is only supported as a local account company-name scan.'));
        }

        return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Search failed: ${error.message}` }] };
      }
    },
  );
}
