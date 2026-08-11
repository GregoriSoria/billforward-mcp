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
    expect(resolveGetById('PAY-1').path).toBe('/payments/PAY-1');
    expect(resolveGetById('REC-1').path).toBe('/receipts/REC-1');
    expect(resolveGetById('ACC-1').path).toBe('/accounts/ACC-1');
    expect(resolveGetById('SUB-1').path).toBe('/subscriptions/SUB-1');
    expect(resolveGetById('INV-1').path).toBe('/invoices/INV-1');
    expect(resolveGetById('PRO-1').path).toBe('/products/PRO-1');
    expect(resolveGetById('PRP-1').path).toBe('/product-rate-plans/PRP-1');
    expect(resolveGetById('PMD-1').path).toBe('/payment-methods/PMD-1');
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
