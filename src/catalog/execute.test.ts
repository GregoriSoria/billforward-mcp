import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { beforeEach, describe, expect, it } from 'vitest';
import { getCatalogEntry } from './entries.js';
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

  it('uppercases order and maps orderBy → order_by', async () => {
    mock.onGet('/payments').reply((config) => {
      expect(config.params).toMatchObject({ order_by: 'created', order: 'DESC', records: 3 });
      return [200, { results: [] }];
    });
    await executeCatalogEntry(
      client,
      {
        name: 'list-payments',
        summary: 'x',
        method: 'GET' as const,
        path: '/payments',
        queryParams: ['records', 'offset', 'order_by', 'order'],
      },
      { records: 3, orderBy: 'created', order: 'desc' },
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

  it('PUTs rate plan id and nested pricingComponents, dropping unknown keys', async () => {
    const pricingComponents = [{ '@type': 'tieredPricingComponent', id: 'PCO-1', tiers: [] }];
    mock.onPut('/product-rate-plans').reply((config) => {
      expect(JSON.parse(config.data)).toEqual({ id: 'PRP-1', name: 'gold', pricingComponents });
      return [200, { results: [] }];
    });
    await executeCatalogEntry(client, getCatalogEntry('update-product-rate-plan')!, {
      id: 'PRP-1',
      name: 'gold',
      pricingComponents,
      environment: 'sandbox',
    });
  });

  it('POSTs a new rate plan to /product-rate-plans', async () => {
    mock.onPost('/product-rate-plans').reply((config) => {
      expect(JSON.parse(config.data)).toEqual({ productID: 'PRO-1', currency: 'USD', name: 'gold' });
      return [200, { results: [] }];
    });
    const entry = getCatalogEntry('create-product-rate-plan')!;
    expect(entry.write).toBe(true);
    await executeCatalogEntry(client, entry, { productID: 'PRO-1', currency: 'USD', name: 'gold' });
  });
});
