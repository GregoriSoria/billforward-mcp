import { describe, expect, it } from 'vitest';
import { getCatalogEntry, searchCatalog } from './search.js';

describe('searchCatalog', () => {
  it('finds credit-notes list by keyword', () => {
    const hits = searchCatalog('credit note', 5);
    expect(hits.some((e) => e.name === 'list-credit-notes')).toBe(true);
  });

  it('finds list-payments by keyword', () => {
    const hits = searchCatalog('list payments', 5);
    expect(hits.some((e) => e.name === 'list-payments')).toBe(true);
  });
});

describe('getCatalogEntry', () => {
  it('returns list-credit-notes', () => {
    expect(getCatalogEntry('list-credit-notes')).toMatchObject({
      method: 'GET',
      path: '/credit-notes',
      write: false,
    });
  });
});
