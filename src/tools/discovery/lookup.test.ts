import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../billforward.js', () => ({
  getClient: vi.fn(),
  environmentParam: {},
}));

import { getClient } from '../../billforward.js';
import { registerLookupTools } from './lookup.js';

type LookupHandler = (input: Record<string, unknown>) => Promise<{
  isError?: boolean;
  content: Array<{ text: string }>;
}>;

function lookupTool() {
  let handler: LookupHandler | undefined;
  registerLookupTools({
    registerTool: (_name: string, _definition: unknown, callback: LookupHandler) => {
      handler = callback;
    },
  } as any);
  if (!handler) throw new Error('lookup tool was not registered');
  return handler;
}

describe('lookup', () => {
  const client = axios.create();
  // @ts-ignore axios-mock-adapter resolution-mode type mismatch
  const mock = new MockAdapter(client);
  const handler = lookupTool();

  beforeEach(() => {
    mock.reset();
    vi.mocked(getClient).mockReturnValue(client as any);
  });

  it('GETs /credit-notes/{id} for CDT prefix', async () => {
    mock.onGet('/credit-notes/CDT-1').reply(200, { results: [{ id: 'CDT-1' }] });

    const out = JSON.parse((await handler({ query: 'CDT-1' })).content[0].text);

    expect(out).toMatchObject({ mode: 'get-by-id', path: '/credit-notes/CDT-1' });
    expect(mock.history.get[0].url).toContain('/credit-notes/CDT-1');
  });

  it('uses /search-v3 for email', async () => {
    mock.onGet('/search-v3').reply(200, { groupedResults: { account: [] } });

    await handler({ query: 'a@b.com', limit: 5 });

    expect(mock.history.get[0].url).toContain('/search-v3');
    expect(mock.history.get[0].params).toMatchObject({ query: 'a@b.com' });
  });

  it('does not fall through to search-v3 on get-by-id 404', async () => {
    mock.onGet('/credit-notes/CDT-MISSING').reply(404, { errorMessage: 'not found' });

    const result = await handler({ query: 'CDT-MISSING' });

    expect(result.isError).toBe(true);
    expect(mock.history.get.map((r) => r.url).join(',')).not.toContain('search-v3');
  });

  it('GETs by resource when resource= is set for UUID-only entities', async () => {
    mock.onGet('/webhooks/uuid-123').reply(200, { results: [{ id: 'uuid-123' }] });

    const out = JSON.parse((await handler({ query: 'uuid-123', resource: 'webhooks' })).content[0].text);

    expect(out).toMatchObject({ mode: 'get-by-id', path: '/webhooks/uuid-123' });
    expect(mock.history.get[0].url).toContain('/webhooks/uuid-123');
  });
});
