export type CatalogEntry = {
  name: string;
  summary: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  pathParams?: string[];
  queryParams?: string[];
  bodyKeys?: string[];
  write?: boolean;
  status?: 'ok' | 'unverified';
};

const LIST_QUERY = ['records', 'offset', 'order_by', 'order'] as const;

// Field names taken from a real GET /product-rate-plans/{id} response, minus server-managed ones
// (versionID, path, displayName — derived from publicName — created/updated, organizationID).
const RATE_PLAN_BODY = [
  'productID', 'name', 'publicName', 'description', 'currency', 'productType', 'taxStatus', 'proRataMode',
  'aggregatingComponents', 'affiliateRatePlanRelationships',
  'duration', 'durationPeriod', 'trial', 'trialPeriod', 'pricingComponents', 'fixedTermDefinitions',
  'taxation', 'metadata', 'validFrom', 'validTill', 'invoiceIssueType', 'paymentTerms',
  'migrationBehaviour', 'failedPaymentBehaviour', 'createZeroValuedInvoices', 'localisedTax',
  'generateServiceEndInvoice',
] as const;

// Same idea for GET /products/{id}: path is derived from name; deleted is set by retire.
// No metadata: on dev, POST /products with metadata fails 400 and PUT /products silently ignores it.
const PRODUCT_BODY = [
  'name', 'description', 'productType', 'duration', 'durationPeriod', 'trial', 'trialPeriod',
  'paymentTerms', 'startDate',
] as const;

export const CATALOG: CatalogEntry[] = [
  {
    name: 'list-accounts',
    summary: 'List merchant accounts with pagination, sorting, and metadata filtering',
    method: 'GET',
    path: '/accounts',
    queryParams: [...LIST_QUERY],
    write: false,
  },
  {
    name: 'list-profiles',
    summary: 'List account profiles with contact details',
    method: 'GET',
    path: '/profiles',
    queryParams: [...LIST_QUERY],
    write: false,
  },
  {
    name: 'list-subscriptions',
    summary: 'List subscriptions with pagination and sorting',
    method: 'GET',
    path: '/subscriptions',
    queryParams: [...LIST_QUERY],
    write: false,
  },
  {
    name: 'list-invoices',
    summary: 'List invoices with pagination and sorting',
    method: 'GET',
    path: '/invoices',
    queryParams: [...LIST_QUERY],
    write: false,
  },
  {
    name: 'list-payments',
    summary: 'List payments across all accounts',
    method: 'GET',
    path: '/payments',
    queryParams: [...LIST_QUERY],
    write: false,
  },
  {
    name: 'list-receipts',
    summary: 'List receipts across all accounts',
    method: 'GET',
    path: '/receipts',
    queryParams: [...LIST_QUERY],
    write: false,
  },
  {
    name: 'list-products',
    summary: 'List products in the billing catalog',
    method: 'GET',
    path: '/products',
    queryParams: [...LIST_QUERY],
    write: false,
  },
  {
    name: 'list-product-rate-plans',
    // ponytail: sizes measured on dev/staging/prod in 2026-10; records=200 took 7-12 s against a 15 s timeout.
    summary:
      'List product rate plans defining subscription pricing. Retired plans are hidden unless include_retired=true, ' +
      'which also returns one row per past version (same id, different versionID; dedupe by id when copying). ' +
      'Plans are heavy (~75 KB each with pricing components): use records<=50 and page with offset; ' +
      'records=200 is ~9 MB and can time out (504)',
    method: 'GET',
    path: '/product-rate-plans',
    queryParams: [...LIST_QUERY, 'include_retired'],
    write: false,
  },
  {
    name: 'create-product',
    summary:
      'Create a product (PRO-…), the parent a product rate plan needs: productID must exist in the target tenant ' +
      'before create-product-rate-plan. Body: name, description, productType (recurring/non-recurring), ' +
      'duration, durationPeriod (days/months/years), trial, trialPeriod. metadata is not accepted here ' +
      '(BF answers 400 "No rate plan was found")',
    method: 'POST',
    path: '/products',
    bodyKeys: [...PRODUCT_BODY],
    write: true,
  },
  {
    name: 'update-product',
    summary:
      'Update (edit) a product by id; send the full product from lookup PRO-… with changes applied. ' +
      'Does not change metadata (BF ignores it on this endpoint)',
    method: 'PUT',
    path: '/products',
    bodyKeys: ['id', ...PRODUCT_BODY],
    write: true,
  },
  {
    name: 'list-units-of-measure',
    summary:
      'List units of measure (UOM-…). Pricing components point at unitOfMeasureID, which differs per tenant: ' +
      'when copying a plan, match units by name and create-unit-of-measure for any missing one',
    method: 'GET',
    path: '/units-of-measure',
    queryParams: [...LIST_QUERY],
    write: false,
  },
  {
    name: 'create-unit-of-measure',
    summary: 'Create a unit of measure. Body: name, displayedAs, rounding (e.g. HALF_EVEN)',
    method: 'POST',
    path: '/units-of-measure',
    bodyKeys: ['name', 'displayedAs', 'rounding'],
    write: true,
  },
  {
    name: 'list-taxation-strategies',
    summary:
      'List taxation strategies (TAX-…) with country, currency, name and percentage. Existing rate plans show links as ' +
      'taxation: [{taxationStrategyID}], and the IDs differ per tenant: when copying a plan, match by country and currency. ' +
      'Unverified: sending taxation on create/update-product-rate-plan (or POST /taxation-links) returned 409 ' +
      '"database integrity" on the dev sandbox for BR/BRL and US/USD; if it fails, link the tax in the BillForward UI',
    method: 'GET',
    path: '/taxation-strategies',
    queryParams: [...LIST_QUERY],
    write: false,
  },
  {
    name: 'list-credit-notes',
    summary: 'List credit notes across the organization',
    method: 'GET',
    path: '/credit-notes',
    queryParams: [...LIST_QUERY],
    write: false,
  },
  {
    name: 'list-credit-notes-by-account',
    summary: 'List credit notes for a specific account',
    method: 'GET',
    path: '/credit-notes/account/{accountId}',
    pathParams: ['accountId'],
    queryParams: [...LIST_QUERY],
    write: false,
  },
  {
    name: 'list-credit-notes-by-invoice',
    summary: 'List credit notes for a specific invoice',
    method: 'GET',
    path: '/credit-notes/invoice/{invoiceId}',
    pathParams: ['invoiceId'],
    queryParams: [...LIST_QUERY],
    write: false,
  },
  {
    name: 'list-credit-notes-by-subscription',
    summary: 'List credit notes for a specific subscription',
    method: 'GET',
    path: '/credit-notes/subscription/{subscriptionId}',
    pathParams: ['subscriptionId'],
    queryParams: [...LIST_QUERY],
    write: false,
  },
  {
    name: 'create-account',
    summary: 'Create a new account with profile details',
    method: 'POST',
    path: '/accounts',
    bodyKeys: ['profile'],
    write: true,
  },
  {
    name: 'update-account',
    summary: 'Update an existing account profile',
    method: 'PUT',
    path: '/accounts',
    bodyKeys: ['id', 'profile'],
    write: true,
  },
  {
    name: 'create-subscription',
    summary: 'Create a subscription for an account on a product rate plan',
    method: 'POST',
    path: '/subscriptions',
    bodyKeys: ['accountId', 'productRatePlanId', 'name', 'state'],
    write: true,
  },
  {
    name: 'cancel-subscription',
    summary: 'Cancel an active subscription',
    method: 'PUT',
    path: '/subscriptions',
    bodyKeys: ['id', 'cancellationAction'],
    write: true,
    status: 'unverified',
  },
  {
    name: 'issue-invoice',
    summary: 'Issue a draft invoice, transitioning it to Unpaid',
    method: 'PUT',
    path: '/invoices',
    bodyKeys: ['id', 'state'],
    write: true,
  },
  {
    name: 'create-product-rate-plan',
    summary:
      'Create a product rate plan (pricing plan) under a product; pricingComponents is an array of ' +
      'BF pricing components, e.g. {"@type":"tieredPricingComponent", tiers, ...}',
    method: 'POST',
    path: '/product-rate-plans',
    bodyKeys: [...RATE_PLAN_BODY],
    write: true,
  },
  {
    name: 'update-product-rate-plan',
    // ponytail: limits below were probed on the dev sandbox; BF appends any tiers sent on PUT.
    summary:
      'Update (edit) plan-level fields of a product rate plan: publicName, description, metadata, productType, taxStatus, ' +
      'proRataMode, trial, validTill, invoiceIssueType, paymentTerms, etc. Full replace: send the whole plan from ' +
      'lookup PRP-… with changes applied, and set tiers: [] on EVERY pricingComponents item (tiers sent are ' +
      'APPENDED, duplicating prices; omitting pricingComponents fails with 409). Cannot edit prices, tiers or ' +
      'pricing components, nor name, productID or path. To change a price: retire-product-rate-plan, then ' +
      'create-product-rate-plan with the new pricing (same name/path is allowed only after the old plan is retired)',
    method: 'PUT',
    path: '/product-rate-plans',
    bodyKeys: ['id', ...RATE_PLAN_BODY],
    write: true,
  },
  {
    name: 'retire-product-rate-plan',
    summary:
      'Retire (delete) a product rate plan by id: sets validTill to now and hides it from list-product-rate-plans; ' +
      'still readable via lookup PRP-…. First step of a price change: a new plan with the same name is rejected ' +
      '(400 "already exists") until the old one is retired',
    method: 'DELETE',
    path: '/product-rate-plans/{id}',
    pathParams: ['id'],
    write: true,
  },
  {
    name: 'create-charge',
    summary: 'Create a one-off charge for an account',
    method: 'POST',
    path: '/charges',
    bodyKeys: ['accountId', 'name', 'description', 'amount', 'currency', 'invoicingType'],
    write: true,
  },
];

export function getCatalogEntry(name: string): CatalogEntry | undefined {
  return CATALOG.find((e) => e.name === name);
}
