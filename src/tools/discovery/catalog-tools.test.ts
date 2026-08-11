import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../billforward.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../billforward.js')>();
  return { ...actual, getClient: vi.fn(actual.getClient) };
});

import { getClient } from '../../billforward.js';
import { registerCatalogTools } from './catalog-tools.js';

type ToolHandler = (input: Record<string, unknown>) => Promise<{
  isError?: boolean;
  content: Array<{ text: string }>;
}>;

function namedTool(name: string): ToolHandler {
  const handlers = new Map<string, ToolHandler>();
  registerCatalogTools({
    registerTool: (toolName: string, _definition: unknown, callback: ToolHandler) => {
      handlers.set(toolName, callback);
    },
  } as any);
  const handler = handlers.get(name);
  if (!handler) throw new Error(`${name} tool was not registered`);
  return handler;
}

describe('catalog tools', () => {
  const searchHandler = namedTool('search-tools');
  const describeHandler = namedTool('describe-tool');
  const callHandler = namedTool('call-api');
  const client = axios.create();
  // @ts-ignore axios-mock-adapter resolution-mode type mismatch
  const mock = new MockAdapter(client);
  const envKeys = ['BILLFORWARD_ENVIRONMENTS', 'BILLFORWARD_ACCESS_TOKEN', 'BILLFORWARD_SANDBOX_ACCESS_TOKEN', 'BILLFORWARD_PRODUCTION_ACCESS_TOKEN'];

  beforeEach(() => {
    mock.reset();
  });

  afterEach(() => {
    for (const key of envKeys) delete process.env[key];
  });

  it('search-tools returns credit-notes matches', async () => {
    const text = (await searchHandler({ query: 'credit notes' })).content[0].text;
    expect(text).toContain('list-credit-notes');
  });

  it('describe-tool returns full entry', async () => {
    const text = (await describeHandler({ name: 'list-credit-notes' })).content[0].text;
    expect(JSON.parse(text).path).toBe('/credit-notes');
  });

  it('call-api blocks writes when env is readonly', async () => {
    process.env.BILLFORWARD_ENVIRONMENTS = JSON.stringify({
      dev: { token: 'dev-token', type: 'sandbox' },
    });

    const result = await callHandler({
      environment: 'dev',
      name: 'create-charge',
      args: { accountId: 'ACC-1', amount: 1 },
    });

    expect(result.isError).toBe(true);
  });

  it('call-api GETs a catalog entry', async () => {
    vi.mocked(getClient).mockReturnValue(client as any);
    mock.onGet('/credit-notes').reply(200, { results: [{ id: 'CDT-1' }] });
    const result = await callHandler({ name: 'list-credit-notes', args: { records: 1 } });
    expect(result.isError).not.toBe(true);
  });
});
