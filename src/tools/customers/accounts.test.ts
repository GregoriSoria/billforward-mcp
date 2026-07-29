import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../billforward.js', () => ({
  getClient: vi.fn(),
  environmentParam: {},
}));

import { getClient } from '../../billforward.js';
import { registerAccountTools } from './accounts.js';

type Handler = (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;

function textOutput(result: Promise<{ content: Array<{ text: string }> }>) {
  return result.then(({ content }) => JSON.parse(content[0].text));
}

function accountTools() {
  const handlers = new Map<string, Handler>();
  const definitions = new Map<string, { inputSchema: Record<string, { safeParse(input: unknown): { success: boolean } }> }>();
  registerAccountTools({
    registerTool: (name: string, definition: any, callback: Handler) => {
      definitions.set(name, definition);
      handlers.set(name, callback);
    },
  } as any);
  const get = (name: string) => {
    const handler = handlers.get(name);
    const definition = definitions.get(name);
    if (!handler || !definition) throw new Error(`${name} was not registered`);
    return { handler, definition };
  };
  return { find: get('find-accounts'), history: get('get-account-history') };
}

describe('account lookup and history', () => {
  const client = axios.create();
  // @ts-ignore axios-mock-adapter resolution-mode type mismatch
  const mock = new MockAdapter(client);
  const { find, history } = accountTools();

  beforeEach(() => {
    mock.reset();
    vi.mocked(getClient).mockReturnValue(client as any);
  });

  it('converts explicit metadata filters to documented meta parameters', async () => {
    mock.onGet('/accounts').reply(200, { results: [{ id: 'ACC-1' }] });

    await find.handler({ metadata: { salesforce_account_id: '001xx' }, limit: 5 });

    expect(mock.history.get[0].params).toMatchObject({ records: 5, 'meta.salesforce_account_id': '001xx' });
  });

  it('rejects an account lookup without an explicit filter', async () => {
    const result = await find.handler({ limit: 5 });

    expect(result).toMatchObject({ isError: true });
    expect(result.content[0].text).toMatch(/exactly one/i);
  });

  it('keeps invoice history when subscriptions fail', async () => {
    mock.onGet('/accounts/ACC-1').reply(200, { results: [{ id: 'ACC-1' }] });
    mock.onGet('/subscriptions/account/ACC-1').reply(500, { message: 'unavailable' });
    mock.onGet('/accounts/ACC-1/invoices').reply(200, { results: [{ id: 'INV-1', accountID: 'ACC-1' }] });

    const output = await textOutput(history.handler({ accountId: 'ACC-1', limit: 5 }));

    expect(output.invoices.results).toHaveLength(1);
    expect(output.errors).toContainEqual(expect.objectContaining({ resource: 'subscriptions', status: 500 }));
    expect(output.payments).toEqual({ available: false, reason: 'No account-scoped payments endpoint was confirmed.' });
    expect(mock.history.get.map((request) => request.url)).not.toContain('/payments');
  });

  it('passes the requested page to both account-scoped history reads and reports it', async () => {
    mock.onGet('/accounts/ACC-1').reply(200, { results: [{ id: 'ACC-1' }] });
    mock.onGet('/subscriptions/account/ACC-1').reply(200, { results: [{ id: 'SUB-1' }], totalRecords: 8 });
    mock.onGet('/accounts/ACC-1/invoices').reply(200, { results: [{ id: 'INV-1' }, { id: 'INV-2' }], totalRecords: 9 });

    const output = await textOutput(history.handler({ accountId: 'ACC-1', limit: 3, offset: 6 }));

    for (const request of mock.history.get.filter((request) => request.url !== '/accounts/ACC-1')) {
      expect(request.params).toMatchObject({ records: 3, offset: 6, order_by: 'created', order: 'DESC' });
    }
    expect(output.pagination).toEqual({
      subscriptions: { offset: 6, records: 3, returned: 1, totalRecords: 8 },
      invoices: { offset: 6, records: 3, returned: 2, totalRecords: 9 },
    });
  });

  it('validates nonnegative integer offsets and parseable ISO datetimes', () => {
    const schema = history.definition.inputSchema as any;

    expect(schema.offset.safeParse(-1).success).toBe(false);
    expect(schema.offset.safeParse(1.5).success).toBe(false);
    expect(schema.from.safeParse('not-a-date').success).toBe(false);
    expect(schema.to.safeParse('2026-02-30T12:00:00Z').success).toBe(false);
    expect(schema.from.safeParse('2026-02-28T12:00:00Z').success).toBe(true);
  });
});
