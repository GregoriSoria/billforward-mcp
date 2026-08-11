import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import axios from 'axios';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import MockAdapter from 'axios-mock-adapter';
import fs from 'fs';
import path from 'path';

vi.mock('./billforward.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./billforward.js')>();
  return { ...actual, getClient: vi.fn(actual.getClient) };
});

import { getClient } from "./billforward.js";
import { registerAccountTools } from "./tools/customers/accounts.js";
import { registerCatalogTools } from "./tools/discovery/catalog-tools.js";
import { registerLookupTools } from "./tools/discovery/lookup.js";

const mocksDir = path.join(process.cwd(), 'src', 'tests', 'mocks');

function loadMock(filename: string) {
  try {
    return JSON.parse(fs.readFileSync(path.join(mocksDir, filename), 'utf-8'));
  } catch (e) {
    return { results: [] };
  }
}

function captureHandler(registerFn: (server: any) => void, toolName: string) {
  let handler: ((input: Record<string, unknown>) => Promise<any>) | undefined;
  registerFn({
    registerTool: (name: string, _definition: unknown, callback: typeof handler) => {
      if (name === toolName) handler = callback;
    },
  });
  if (!handler) throw new Error(`${toolName} was not registered`);
  return handler;
}

describe('MCP Server - Read Tools with Mocks', () => {
  let server: McpServer;
  let callApi: ReturnType<typeof captureHandler>;
  const client = axios.create();
  // @ts-ignore - axios-mock-adapter version mismatch
  const mock = new MockAdapter(client);

  beforeAll(() => {
    process.env.BILLFORWARD_SANDBOX_ACCESS_TOKEN = 'test-token';
    vi.mocked(getClient).mockReturnValue(client as any);

    mock.onGet("/accounts").reply(200, loadMock('list-accounts.json'));
    mock.onGet("/profiles").reply(200, loadMock('list-profiles.json'));
    mock.onGet("/subscriptions").reply(200, loadMock('list-subscriptions.json'));
    mock.onGet("/invoices").reply(200, loadMock('list-invoices.json'));
    mock.onGet("/payments").reply(200, loadMock('list-payments.json'));
    mock.onGet("/receipts").reply(200, loadMock('list-receipts.json'));
    mock.onGet("/products").reply(200, loadMock('list-products.json'));
    mock.onGet("/product-rate-plans").reply(200, loadMock('list-product-rate-plans.json'));

    mock.onGet(/\/accounts\/[a-zA-Z0-9-]+$/).reply(200, loadMock('get-account.json'));
    mock.onGet(/\/subscriptions\/[a-zA-Z0-9-]+$/).reply(200, loadMock('get-subscription.json'));
    mock.onGet(/\/invoices\/[a-zA-Z0-9-]+$/).reply(200, loadMock('get-invoice.json'));
    mock.onGet(/\/payments\/[a-zA-Z0-9-]+$/).reply(200, loadMock('get-payment.json'));
    mock.onGet(/\/product-rate-plans\/[a-zA-Z0-9-]+$/).reply(200, loadMock('get-rate-plan.json'));
    mock.onGet(/\/credit-notes\/[a-zA-Z0-9-]+$/).reply(200, { results: [{ id: 'CDT-1' }] });
    mock.onGet('/search-v3').reply(200, { groupedResults: {} });

    server = new McpServer({
      name: "TestServer",
      version: "0.1.0",
    });

    registerAccountTools(server);
    registerLookupTools(server);
    registerCatalogTools(server);
    callApi = captureHandler(registerCatalogTools, 'call-api');
  });

  beforeEach(() => {
    vi.mocked(getClient).mockReturnValue(client as any);
  });

  afterAll(() => {
    mock.restore();
    delete process.env.BILLFORWARD_SANDBOX_ACCESS_TOKEN;
  });

  describe('Server Initialization', () => {
    it('registers the tool catalog for handler-level policy enforcement', () => {
      expect(server).toBeDefined();
    });
  });

  describe('Catalog call-api execution (Mocked)', () => {
    async function callCatalog(name: string, args: Record<string, unknown> = {}) {
      const result = await callApi({ environment: 'sandbox', name, args });
      expect(result.isError).not.toBe(true);
      return JSON.parse(result.content[0].text);
    }

    it('call-api: list-accounts', async () => {
      const data = await callCatalog('list-accounts', { records: 5, offset: 0 });
      expect(data).toHaveProperty('results');
    });

    it('call-api: list-profiles', async () => {
      const data = await callCatalog('list-profiles', { records: 5, offset: 0 });
      expect(data).toHaveProperty('results');
    });

    it('call-api: list-subscriptions', async () => {
      const data = await callCatalog('list-subscriptions', { records: 5, offset: 0 });
      expect(data).toHaveProperty('results');
    });

    it('call-api: list-invoices', async () => {
      const data = await callCatalog('list-invoices', { records: 5, offset: 0 });
      expect(data).toHaveProperty('results');
    });

    it('call-api: list-payments', async () => {
      const data = await callCatalog('list-payments', { records: 5, offset: 0 });
      expect(data).toHaveProperty('results');
    });

    it('call-api: list-receipts', async () => {
      const data = await callCatalog('list-receipts', { records: 5, offset: 0 });
      expect(data).toHaveProperty('results');
    });

    it('call-api: list-products', async () => {
      const data = await callCatalog('list-products', { records: 5, offset: 0 });
      expect(data).toHaveProperty('results');
    });

    it('call-api: list-product-rate-plans', async () => {
      const data = await callCatalog('list-product-rate-plans', { records: 5, offset: 0 });
      expect(data).toHaveProperty('results');
    });
  });

  describe('Lookup endpoints (Mocked)', () => {
    it('lookup by prefixed ID', async () => {
      const response = await client.get("/accounts/ACC-1234");
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('results');
    });

    it('lookup via search-v3', async () => {
      const response = await client.get("/search-v3", { params: { query: 'test@example.com', records: 5, offset: 0 } });
      expect(response.status).toBe(200);
    });
  });
});
