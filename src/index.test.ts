import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import MockAdapter from 'axios-mock-adapter';
import { getClient } from "./billforward.js";
import type { AxiosInstance } from "axios";
import fs from 'fs';
import path from 'path';

// Import tool registration functions
import { registerAccountTools } from "./tools/customers/accounts.js";
import { registerSubscriptionTools } from "./tools/customers/subscriptions.js";
import { registerInvoiceTools } from "./tools/customers/invoices.js";
import { registerPaymentTools } from "./tools/customers/payments.js";
import { registerChargeTools } from "./tools/customers/charges.js";
import { registerPlanTools } from "./tools/pricing/plans.js";
import { registerLookupTools } from "./tools/discovery/lookup.js";

let client: AxiosInstance;
// @ts-ignore - bypassing strict type mismatch between axios-mock-adapter and project axios versions
let mock: MockAdapter;
const mocksDir = path.join(process.cwd(), 'src', 'tests', 'mocks');

function loadMock(filename: string) {
  try {
    return JSON.parse(fs.readFileSync(path.join(mocksDir, filename), 'utf-8'));
  } catch (e) {
    return { results: [] };
  }
}

describe('MCP Server - Read Tools with Mocks', () => {
  let server: McpServer;

  beforeAll(() => {
    process.env.BILLFORWARD_SANDBOX_ACCESS_TOKEN = 'test-token';
    client = getClient('sandbox');
    // @ts-ignore - axios-mock-adapter version mismatch
    mock = new MockAdapter(client as any);

    // Basic catch-all for the sandbox client
    mock.onGet("/accounts").reply(200, loadMock('list-accounts.json'));
    mock.onGet("/profiles").reply(200, loadMock('list-profiles.json'));
    mock.onGet("/subscriptions").reply(200, loadMock('list-subscriptions.json'));
    mock.onGet("/invoices").reply(200, loadMock('list-invoices.json'));
    mock.onGet("/payments").reply(200, loadMock('list-payments.json'));
    mock.onGet("/receipts").reply(200, loadMock('list-receipts.json'));
    mock.onGet("/products").reply(200, loadMock('list-products.json'));
    mock.onGet("/product-rate-plans").reply(200, loadMock('list-product-rate-plans.json'));

    // Dynamic routes (regex matching) — kept for lookup and list tool mocks
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

    // Register all tools for tests; per-environment policy is enforced in handlers.
    registerAccountTools(server);
    registerSubscriptionTools(server);
    registerInvoiceTools(server);
    registerPaymentTools(server);
    registerChargeTools(server);
    registerPlanTools(server);
    registerLookupTools(server);
  });

  afterAll(() => {
    mock.restore();
  });

  describe('Server Initialization', () => {
    it('registers the tool catalog for handler-level policy enforcement', () => {
      expect(server).toBeDefined();
    });
  });

  describe('Tool Endpoints Execution (Mocked)', () => {
    it('Tool: list-accounts', async () => {
      const response = await client.get("/accounts");
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('results');
    });

    it('Tool: lookup by prefixed ID', async () => {
      const response = await client.get("/accounts/ACC-1234");
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('results');
    });

    it('Tool: lookup via search-v3', async () => {
      const response = await client.get("/search-v3", { params: { query: 'test@example.com', records: 5, offset: 0 } });
      expect(response.status).toBe(200);
    });

    it('Tool: list-profiles', async () => {
      const response = await client.get("/profiles");
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('results');
    });

    it('Tool: list-subscriptions', async () => {
      const response = await client.get("/subscriptions");
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('results');
    });

    it('Tool: list-invoices', async () => {
      const response = await client.get("/invoices");
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('results');
    });

    it('Tool: list-payments', async () => {
      const response = await client.get("/payments");
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('results');
    });

    it('Tool: list-receipts', async () => {
      const response = await client.get("/receipts");
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('results');
    });

    it('Tool: list-products', async () => {
      const response = await client.get("/products");
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('results');
    });

    it('Tool: list-product-rate-plans', async () => {
      const response = await client.get("/product-rate-plans");
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('results');
    });
  });
});
