import { describe, expect, it } from 'vitest';
import { resolveGetById } from './prefixes.js';

describe('resolveGetById', () => {
  it('maps CDT to credit-notes', () => {
    expect(resolveGetById('CDT-61A31A7F-AAAA-BBBB-CCCC-DDDDEEEE')).toEqual({
      path: '/credit-notes/CDT-61A31A7F-AAAA-BBBB-CCCC-DDDDEEEE',
      id: 'CDT-61A31A7F-AAAA-BBBB-CCCC-DDDDEEEE',
    });
  });

  it('maps PAY, REC, ACC, SUB, INV, PRO, PRP, PMD', () => {
    const cases: [string, string][] = [
      ['PAY-1', '/payments/PAY-1'],
      ['REC-1', '/receipts/REC-1'],
      ['ACC-1', '/accounts/ACC-1'],
      ['SUB-1', '/subscriptions/SUB-1'],
      ['INV-1', '/invoices/INV-1'],
      ['PRO-1', '/products/PRO-1'],
      ['PRP-1', '/product-rate-plans/PRP-1'],
      ['PMD-1', '/payment-methods/PMD-1'],
    ];
    for (const [id, path] of cases) {
      expect(resolveGetById(id)).toEqual({ path, id });
    }
  });

  it('rejects unknown prefix without resource', () => {
    const result = resolveGetById('ZZZ-1');
    expect(result).toHaveProperty('error');
  });

  it('uses resource override for UUID-only ids', () => {
    expect(resolveGetById('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'amendments')).toEqual({
      path: '/amendments/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    });
  });

  it('does not treat emails as prefixed ids', () => {
    expect(resolveGetById('user@example.com')).toHaveProperty('error');
  });
});
