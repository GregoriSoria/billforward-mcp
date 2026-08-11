import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { beforeEach, describe, expect, it } from 'vitest';
import { executeCatalogEntry } from './execute.js';

describe('executeCatalogEntry', () => {
  const client = axios.create();
  // @ts-ignore axios-mock-adapter resolution-mode type mismatch
  const mock = new MockAdapter(client);

  beforeEach(() => {
    mock.reset();
  });

  it('fills path params and query for GET', async () => {
    mock.onGet('/credit-notes/account/ACC-1').reply((config) => {
      expect(config.params).toMatchObject({ records: 5 });
      return [200, { results: [] }];
    });
    const entry = {
      name: 'list-credit-notes-by-account',
      summary: 'x',
      method: 'GET' as const,
      path: '/credit-notes/account/{accountId}',
      pathParams: ['accountId'],
      queryParams: ['records', 'offset'],
    };
    await executeCatalogEntry(client, entry, { accountId: 'ACC-1', records: 5 });
  });

  it('forwards meta.* query args on GET', async () => {
    mock.onGet('/accounts').reply((config) => {
      expect(config.params).toMatchObject({ 'meta.salesforce_account_id': '001xx' });
      return [200, { results: [] }];
    });
    await executeCatalogEntry(
      client,
      {
        name: 'list-accounts',
        summary: 'x',
        method: 'GET' as const,
        path: '/accounts',
        queryParams: ['records', 'offset'],
      },
      { 'meta.salesforce_account_id': '001xx' },
    );
  });

  it('POSTs body keys for write entries', async () => {
    mock.onPost('/charges').reply((config) => {
      expect(JSON.parse(config.data)).toMatchObject({ accountId: 'ACC-1', amount: 10 });
      return [200, { results: [] }];
    });
    await executeCatalogEntry(
      client,
      {
        name: 'create-charge',
        summary: 'x',
        method: 'POST',
        path: '/charges',
        bodyKeys: ['accountId', 'name', 'amount', 'currency'],
        write: true,
      },
      { accountId: 'ACC-1', name: 'fee', amount: 10, currency: 'USD' },
    );
  });
});
