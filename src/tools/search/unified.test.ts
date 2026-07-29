import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { describe, expect, it } from 'vitest';
import { normalizeCompanyName, readResource, toSafeParams } from '../read-diagnostics.js';

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
