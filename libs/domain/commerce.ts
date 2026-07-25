import type { DomainSpec, VendorMap, VendorMapV1 } from './types.js';

/**
 * Sample domain shape for commerce-style events.
 * This is a **domain template**, not a vendor catalog.
 * Agents discover the customer's real domain via skills; maps are customer-owned.
 */
export const COMMERCE_DOMAIN: DomainSpec = {
  id: 'commerce',
  version: '1.1.0',
  description:
    'Sample commerce intents for agents to adapt. Not a list of vendor integrations.',
  intents: [
    { id: 'page_view', description: 'Page view' },
    { id: 'view_item', description: 'PDP' },
    { id: 'add_to_cart', description: 'Add to cart' },
    { id: 'begin_checkout', description: 'Begin checkout' },
    { id: 'purchase', description: 'Purchase' },
    { id: 'lead', description: 'Lead' },
    { id: 'search', description: 'Search' },
  ],
  fields: [
    { path: 'eventId', type: 'string', description: 'Idempotency id', required: true },
    { path: 'occurredAt', type: 'datetime', description: 'Event time' },
    { path: 'user.email', type: 'string', description: 'Raw email' },
    { path: 'user.phone', type: 'string', description: 'Raw phone' },
    { path: 'user.externalId', type: 'string', description: 'User id' },
    { path: 'product.id', type: 'string', description: 'SKU' },
    {
      path: 'products',
      type: 'array<object>',
      description: 'Line items for cart/checkout (foreach flows)',
    },
    { path: 'value.amount', type: 'number', description: 'Value' },
    { path: 'value.currency', type: 'string', description: 'Currency' },
    { path: 'context.url', type: 'string', description: 'URL' },
  ],
};

/**
 * Identity for an empty map skeleton agents fill from evidence.
 * Not a catalog entry — created per project when an agent starts a vendor.
 */
export type EmptyMapSeed = {
  vendor: string;
  displayName: string;
  documentation?: VendorMap['documentation'];
};

/** Empty skeleton map (v1). Agents research docs and fill via proposals. */
export function emptyVendorMap(seed: EmptyMapSeed): VendorMapV1 {
  return {
    vendor: seed.vendor,
    displayName: seed.displayName,
    version: '0.0.0-empty',
    auth: { type: 'custom', notes: 'Agent sets from docs' },
    endpoint: { method: 'POST', path: '/REPLACE_FROM_DOCS', baseUrl: 'https://REPLACE_FROM_DOCS' },
    intents: {},
    fields: [],
    documentation: seed.documentation ?? [],
    status: 'skeleton',
    notes: 'Empty on purpose. Use skill layerkit-research-vendor / layerkit-orchestrate-integration.',
  };
}

/**
 * @deprecated No vendor catalog. POC no longer seeds N vendor slots.
 * Returns empty array — agents add vendors per project from evidence.
 */
export function buildPocVendorMaps(): VendorMap[] {
  return [];
}
