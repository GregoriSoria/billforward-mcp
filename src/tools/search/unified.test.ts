import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeCompanyName, readResource, toSafeParams } from '../read-diagnostics.js';

vi.mock('../../billforward.js', () => ({
  getClient: vi.fn(),
  environmentParam: {},
}));

import { getClient } from '../../billforward.js';
import { metadataSchemaUsageTip, registerInsightTools } from '../insights/customer360.js';

type Handler = (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;

function textOutput(result: Promise<{ content: Array<{ text: string }> }>) {
  return result.then(({ content }) => JSON.parse(content[0].text));
}

function namedTool(register: (server: any) => void, name: string) {
  let handler: Handler | undefined;
  register({
    registerTool: (toolName: string, _definition: unknown, callback: Handler) => {
      if (toolName === name) handler = callback;
    },
  });
  if (!handler) throw new Error(`${name} was not registered`);
  return handler;
}

describe('read diagnostics', () => {
  it('normalizes accents and punctuation for exact company names', () => {
    expect(normalizeCompanyName(' Ácme, S.A. ')).toBe('acme sa');
  });

  it('keeps a failed resource read in errors with no token or email', async () => {
    const client = axios.create({ params: { access_token: 'test-token' } });
    // @ts-ignore - axios-mock-adapter resolution-mode type mismatch
    const mock = new MockAdapter(client);
    mock.onGet('/accounts/email/test@example.com').reply(503, { message: 'down' }, { 'x-request-id': 'request-1' });

    const output = await readResource(client, 'accounts', '/accounts/email/test@example.com', {
      access_token: 'test-token',
      email: 'test@example.com',
      records: 5,
    });

    expect(output.error).toMatchObject({ resource: 'accounts', status: 503, message: 'HTTP 503', requestId: 'request-1' });
    expect(JSON.stringify(output)).not.toMatch(/access_token|test@example.com|test-token/);
  });

  it('omits every token-bearing parameter key from diagnostics', () => {
    expect(toSafeParams({
      token: 'token-value',
      refresh_token: 'refresh-value',
      api_token: 'api-value',
      access_token: 'access-value',
      records: 5,
    })).toEqual({ records: 5 });
  });

  it('omits token-bearing values under harmless parameter keys', () => {
    expect(toSafeParams({
      cursor: 'Bearer secret-value',
      page: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature',
      named: 'token=secret-value',
      access: 'access token: secret-value',
      refresh: 'refresh-token=secret-value',
      api: 'api_token=secret-value',
      records: 5,
    })).toEqual({ records: 5 });
  });

  it('omits unsafe request IDs while preserving opaque IDs', async () => {
    const client = axios.create();
    // @ts-ignore - axios-mock-adapter resolution-mode type mismatch
    const mock = new MockAdapter(client);
    mock.onGet('/unsafe-email').reply(200, [], { 'x-request-id': 'trace-test@example.com' });
    mock.onGet('/unsafe-token').reply(200, [], { 'x-correlation-id': 'Bearer secret-token' });
    mock.onGet('/safe').reply(200, [], { 'x-correlation-id': '01J123ABC456DEF789GHIJK' });

    await expect(readResource(client, 'accounts', '/unsafe-email')).resolves.not.toHaveProperty('diagnostic.requestId');
    await expect(readResource(client, 'accounts', '/unsafe-token')).resolves.not.toHaveProperty('diagnostic.requestId');
    await expect(readResource(client, 'accounts', '/safe')).resolves.toHaveProperty('diagnostic.requestId', '01J123ABC456DEF789GHIJK');
  });

  it('omits email and token-like record IDs from diagnostics', async () => {
    const client = axios.create();
    // @ts-ignore - axios-mock-adapter resolution-mode type mismatch
    const mock = new MockAdapter(client);
    mock.onGet('/accounts').reply(200, { results: [
      { id: 'ACC-1' },
      { id: 'customer@example.com' },
      { id: 'Bearer secret-token' },
      { id: 'token=secret-token' },
      { id: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature' },
    ] });

    await expect(readResource(client, 'accounts', '/accounts')).resolves.toHaveProperty('diagnostic.ids', ['ACC-1']);
  });

  it('redacts token-like endpoint path segments while preserving documented paths', async () => {
    const client = axios.create();
    // @ts-ignore - axios-mock-adapter resolution-mode type mismatch
    const mock = new MockAdapter(client);
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature';
    mock.onGet(`/accounts/${jwt}/metadata`).reply(200, []);
    mock.onGet('/accounts/ACC-1/metadata').reply(200, []);

    await expect(readResource(client, 'accounts', `/accounts/${jwt}/metadata`)).resolves.toHaveProperty('diagnostic.endpoint', '/accounts/[redacted]/metadata');
    await expect(readResource(client, 'accounts', '/accounts/ACC-1/metadata')).resolves.toHaveProperty('diagnostic.endpoint', '/accounts/ACC-1/metadata');
  });

  it('returns safe diagnostics for successful resource reads', async () => {
    const client = axios.create();
    // @ts-ignore - axios-mock-adapter resolution-mode type mismatch
    const mock = new MockAdapter(client);
    mock.onGet('/accounts').reply(200, { results: [{ id: 'ACC-1' }, { id: 'ACC-2' }] }, { 'x-request-id': 'request-1' });

    const output = await readResource(client, 'accounts', '/accounts', { records: 2, access_token: 'test-token' });

    expect(output.diagnostic).toMatchObject({
      resource: 'accounts', endpoint: '/accounts', status: 200, records: 2,
      ids: ['ACC-1', 'ACC-2'], params: { records: 2 }, requestId: 'request-1',
    });
  });
});

describe('adjacent read guidance', () => {
  const client = axios.create();
  // @ts-ignore - axios-mock-adapter resolution-mode type mismatch
  const mock = new MockAdapter(client);
  const customerSummaryHandler = namedTool(registerInsightTools, 'get-customer-summary');

  beforeEach(() => {
    mock.reset();
    vi.mocked(getClient).mockReturnValue(client as any);
  });

  it('does not advertise key-value syntax for search metadata', () => {
    expect(metadataSchemaUsageTip()).not.toContain("search query using 'key: value'");
    expect(metadataSchemaUsageTip()).toContain('meta.<key>=<value>');
  });

  it('uses account-scoped endpoints for the customer summary and returns resource failures', async () => {
    mock.onGet('/accounts/ACC-1').reply(200, { results: [{ id: 'ACC-1', profile: {} }] });
    mock.onGet('/subscriptions/account/ACC-1').reply(500);
    mock.onGet('/accounts/ACC-1/invoices').reply(200, { results: [{ id: 'INV-1' }] });

    const output = await textOutput(customerSummaryHandler({ query: 'ACC-1' }));

    expect(mock.history.get.map((request) => request.url)).toContain('/subscriptions/account/ACC-1');
    expect(mock.history.get.map((request) => request.url)).toContain('/accounts/ACC-1/invoices');
    expect(mock.history.get.some((request) => request.params?.filter)).toBe(false);
    expect(output.errors).toContainEqual(expect.objectContaining({ resource: 'subscriptions', status: 500 }));
    expect(output.recentInvoices).toEqual([expect.objectContaining({ id: 'INV-1' })]);
  });
});
