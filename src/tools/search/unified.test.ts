import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeCompanyName, readResource, toSafeParams } from '../read-diagnostics.js';

vi.mock('../../billforward.js', () => ({
  getClient: vi.fn(),
  environmentParam: {},
}));

import { getClient } from '../../billforward.js';
import { registerSearchTools } from './unified.js';

type SearchHandler = (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;

function textOutput(result: Promise<{ content: Array<{ text: string }> }>) {
  return result.then(({ content }) => JSON.parse(content[0].text));
}

function searchHandler() {
  let handler: SearchHandler | undefined;
  registerSearchTools({
    registerTool: (_name: string, _definition: unknown, callback: SearchHandler) => { handler = callback; },
  } as any);
  if (!handler) throw new Error('search handler was not registered');
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

describe('search', () => {
  const client = axios.create();
  // @ts-ignore - axios-mock-adapter resolution-mode type mismatch
  const mock = new MockAdapter(client);
  const handler = searchHandler();

  beforeEach(() => {
    mock.reset();
    vi.mocked(getClient).mockReturnValue(client as any);
  });

  it('uses the dedicated email endpoint for an exact account lookup', async () => {
    mock.onGet('/accounts/email/billing@example.test').reply(200, { results: [{ id: 'ACC-1' }] });

    await handler({ query: 'billing@example.test', entity: 'accounts', match: 'exact', limit: 5 });

    expect(mock.history.get.map(r => r.url)).toContain('/accounts/email/billing@example.test');
    expect(mock.history.get.some(r => r.params?.filter)).toBe(false);
  });

  it('does not return a non-equal company name for match=exact', async () => {
    mock.onGet('/accounts').reply(200, { results: [{ id: 'ACC-OTHER', profile: { companyName: 'Acme Holdings' } }] });

    const output = await textOutput(handler({ query: 'Acme', entity: 'accounts', match: 'exact', limit: 5 }));

    expect(output.accounts).toEqual([]);
  });

  it('labels a contains company match as approximate', async () => {
    mock.onGet('/accounts').reply(200, { results: [{ id: 'ACC-1', profile: { companyName: 'Acme Holdings' } }] });

    const output = await textOutput(handler({ query: 'Acme', entity: 'accounts', match: 'contains', limit: 5 }));

    expect(output.accounts[0]).toMatchObject({ id: 'ACC-1', match: 'companyName-contains-local', approximate: true });
  });

  it('does not call subscriptions or invoices when entity=accounts', async () => {
    mock.onGet('/accounts/ACC-1').reply(200, { results: [{ id: 'ACC-1' }] });

    await handler({ query: 'ACC-1', entity: 'accounts', match: 'exact', limit: 5 });

    expect(mock.history.get.map(r => r.url)).not.toContain('/subscriptions/ACC-1');
    expect(mock.history.get.map(r => r.url)).not.toContain('/invoices');
  });

  it('reports a bounded company scan as truncated when more accounts exist', async () => {
    mock.onGet('/accounts').reply(200, { totalRecords: 201, results: [{ id: 'ACC-1', profile: { companyName: 'Acme' } }] });

    const output = await textOutput(handler({ query: 'Acme', entity: 'accounts', match: 'exact', limit: 5 }));

    expect(output.truncated).toBe(true);
    expect(output.diagnostics[0]).toMatchObject({ resource: 'accounts', endpoint: '/accounts' });
  });
});
