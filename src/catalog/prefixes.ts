export const PREFIX_PATHS: Record<string, string> = {
  ACC: '/accounts',
  SUB: '/subscriptions',
  INV: '/invoices',
  PAY: '/payments',
  REC: '/receipts',
  CDT: '/credit-notes',
  PRO: '/products',
  PRP: '/product-rate-plans',
  PRF: '/profiles',
  PMD: '/payment-methods',
  COU: '/coupons',
  ORG: '/organizations',
  PER: '/permissions',
  ROL: '/roles',
  PCO: '/pricing-components',
  TAX: '/taxation-strategies',
  UOM: '/units-of-measure',
};

const RESOURCE_PATHS: Record<string, string> = {
  amendments: '/amendments',
  configurations: '/configurations',
  'coupon-definitions': '/coupon-definitions',
  instances: '/coupon-instances',
  'coupon-instances': '/coupon-instances',
  books: '/coupon-books',
  'coupon-books': '/coupon-books',
  'book-definitions': '/coupon-book-definitions',
  'coupon-book-definitions': '/coupon-book-definitions',
  modifiers: '/coupon-modifiers',
  'coupon-modifiers': '/coupon-modifiers',
  rules: '/coupon-rules',
  'coupon-rules': '/coupon-rules',
  'dunning-lines': '/dunning-lines',
  'taxation-links': '/taxation-links',
  users: '/users',
  webhooks: '/webhooks',
  synchConfigs: '/synchConfigs',
  synchJobs: '/synchJobs',
  notifications: '/notifications',
  'audit-logs': '/audit-logs',
};

const PREFIXED = /^([A-Z]{2,4})-([A-Z0-9-]+)$/;

export function resolveGetById(
  query: string,
  resource?: string,
): { path: string; id: string } | { error: string } {
  const id = query.trim();
  const match = PREFIXED.exec(id);
  if (match) {
    const prefix = match[1];
    const base = PREFIX_PATHS[prefix];
    if (!base) {
      return {
        error: `Unknown ID prefix ${prefix}-. Known: ${Object.keys(PREFIX_PATHS).join(', ')}. Pass resource= for UUID-only entities, or use search-tools.`,
      };
    }
    return { path: `${base}/${id}`, id };
  }
  if (resource) {
    const base =
      RESOURCE_PATHS[resource] ?? PREFIX_PATHS[resource.toUpperCase()] ?? `/${resource}`;
    return { path: `${base}/${id}`, id };
  }
  return {
    error:
      'Not a prefixed Billforward ID. Pass resource= for UUID lookups, or use lookup without resource to call /search-v3.',
  };
}
