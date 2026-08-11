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

export const CATALOG: CatalogEntry[] = [
  {
    name: 'list-accounts',
    summary: 'List merchant accounts with pagination, sorting, and metadata filtering',
    method: 'GET',
    path: '/accounts',
    queryParams: [...LIST_QUERY, 'created_after', 'created_before'],
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
    queryParams: [...LIST_QUERY, 'period_start_after', 'period_start_before'],
    write: false,
  },
  {
    name: 'list-invoices',
    summary: 'List invoices with pagination and sorting',
    method: 'GET',
    path: '/invoices',
    queryParams: [...LIST_QUERY, 'period_start_after', 'period_start_before'],
    write: false,
  },
  {
    name: 'list-payments',
    summary: 'List payments across all accounts',
    method: 'GET',
    path: '/payments',
    queryParams: [...LIST_QUERY, 'created_after', 'created_before'],
    write: false,
  },
  {
    name: 'list-receipts',
    summary: 'List receipts across all accounts',
    method: 'GET',
    path: '/receipts',
    queryParams: [...LIST_QUERY, 'created_after', 'created_before'],
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
    summary: 'List product rate plans defining subscription pricing',
    method: 'GET',
    path: '/product-rate-plans',
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
