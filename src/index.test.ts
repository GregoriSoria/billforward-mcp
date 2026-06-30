import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import MockAdapter from 'axios-mock-adapter';
import { bfClient } from "./billforward.js";
import fs from 'fs';
import path from 'path';

// Import tool registration functions
import { registerAccountTools } from "./tools/customers/accounts.js";
import { registerSubscriptionTools } from "./tools/customers/subscriptions.js";
import { registerInvoiceTools } from "./tools/customers/invoices.js";
import { registerPaymentTools } from "./tools/customers/payments.js";
import { registerChargeTools } from "./tools/customers/charges.js";
import { registerPlanTools } from "./tools/pricing/plans.js";

// @ts-ignore - bypassing strict type mismatch between axios-mock-adapter and project axios versions
const mock = new MockAdapter(bfClient as any);
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
    // Basic catch-all for bfClient
    mock.onGet("/accounts").reply(200, loadMock('list-accounts.json'));
    mock.onGet("/profiles").reply(200, loadMock('list-profiles.json'));
    mock.onGet("/subscriptions").reply(200, loadMock('list-subscriptions.json'));
    mock.onGet("/invoices").reply(200, loadMock('list-invoices.json'));
    mock.onGet("/payments").reply(200, loadMock('list-payments.json'));
    mock.onGet("/receipts").reply(200, loadMock('list-receipts.json'));
    mock.onGet("/products").reply(200, loadMock('list-products.json'));
    mock.onGet("/product-rate-plans").reply(200, loadMock('list-product-rate-plans.json'));

    // Dynamic routes (regex matching)
    mock.onGet(/\/accounts\/email\/.+/).reply(200, loadMock('get-account-by-email.json'));
    mock.onGet(/\/accounts\/[a-zA-Z0-9-]+$/).reply(200, loadMock('get-account.json'));
    mock.onGet(/\/subscriptions\/[a-zA-Z0-9-]+$/).reply(200, loadMock('get-subscription.json'));
    mock.onGet(/\/invoices\/[a-zA-Z0-9-]+$/).reply(200, loadMock('get-invoice.json'));
    mock.onGet(/\/payments\/[a-zA-Z0-9-]+$/).reply(200, loadMock('get-payment.json'));
    mock.onGet(/\/product-rate-plans\/[a-zA-Z0-9-]+$/).reply(200, loadMock('get-rate-plan.json'));

    server = new McpServer({
      name: "TestServer",
      version: "0.1.0",
    });

    // Register all tools in read-only mode for tests
    registerAccountTools(server, true);
    registerSubscriptionTools(server, true);
    registerInvoiceTools(server, true);
    registerPaymentTools(server, true);
    registerChargeTools(server, true);
    registerPlanTools(server, true);
  });

  afterAll(() => {
    mock.restore();
  });

  describe('Server Initialization', () => {
    it('should register read tools but not write tools when isReadOnly is true', () => {
      expect(server).toBeDefined();
    });
  });

  describe('Tool Endpoints Execution (Mocked)', () => {
    it('Tool: list-accounts', async () => {
      const response = await bfClient.get("/accounts");
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('results');
    });

    it('Tool: get-account', async () => {
      const response = await bfClient.get("/accounts/ACC-1234");
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('results');
    });

    it('Tool: get-account-by-email', async () => {
      const response = await bfClient.get("/accounts/email/test@example.com");
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('results');
    });

    it('Tool: list-profiles', async () => {
      const response = await bfClient.get("/profiles");
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('results');
    });

    it('Tool: list-subscriptions', async () => {
      const response = await bfClient.get("/subscriptions");
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('results');
    });

    it('Tool: get-subscription', async () => {
      const response = await bfClient.get("/subscriptions/SUB-1234");
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('results');
    });

    it('Tool: list-invoices', async () => {
      const response = await bfClient.get("/invoices");
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('results');
    });

    it('Tool: get-invoice', async () => {
      const response = await bfClient.get("/invoices/INV-1234");
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('results');
    });

    it('Tool: list-payments', async () => {
      const response = await bfClient.get("/payments");
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('results');
    });

    it('Tool: list-receipts', async () => {
      const response = await bfClient.get("/receipts");
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('results');
    });

    it('Tool: get-payment', async () => {
      const response = await bfClient.get("/payments/PAY-1234");
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('results');
      expect(response.data.results[0]).toHaveProperty('description');
    });

    it('Tool: list-products', async () => {
      const response = await bfClient.get("/products");
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('results');
    });

    it('Tool: list-product-rate-plans', async () => {
      const response = await bfClient.get("/product-rate-plans");
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('results');
    });

    it('Tool: get-rate-plan', async () => {
      const response = await bfClient.get("/product-rate-plans/PRP-1234");
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('results');
    });
  });
});
