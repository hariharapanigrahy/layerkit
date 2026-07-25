import type { DomainSpec, VendorMap, VendorMapV1 } from './types.js';

/** Sample commerce domain shape (intents + fields). */
export const COMMERCE_DOMAIN: DomainSpec = {
  id: 'commerce',
  version: '1.1.0',
  description: 'Sample commerce intents and fields.',
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

export type EmptyMapSeed = {
  vendor: string;
  displayName: string;
  documentation?: VendorMap['documentation'];
};

/** Empty skeleton map (v1). */
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
    notes: 'Empty skeleton.',
  };
}

/** @deprecated Prefer emptyVendorMap when creating a vendor map. */
export function buildPocVendorMaps(): VendorMap[] {
  return [];
}
