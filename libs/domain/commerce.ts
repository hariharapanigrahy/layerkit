import type { DomainSpec, VendorMap } from './types.js';

export const COMMERCE_DOMAIN: DomainSpec = {
  id: 'commerce',
  version: '1.0.0',
  description: 'Shared commerce intents; vendor wire shapes are agent-authored from docs',
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
    { path: 'value.amount', type: 'number', description: 'Value' },
    { path: 'value.currency', type: 'string', description: 'Currency' },
    { path: 'context.url', type: 'string', description: 'URL' },
  ],
};

/** Catalog entry: identity + primary docs only. Maps are agent-authored. */
export type VendorSlot = {
  vendor: string;
  displayName: string;
  documentation: VendorMap['documentation'];
};

/** Empty vendor slots — docs only. Agents fill maps. Scales by appending slots. */
export const VENDOR_SLOTS: readonly VendorSlot[] = [
  {
    vendor: 'meta',
    displayName: 'Meta Conversions API',
    documentation: [
      {
        title: 'Conversions API',
        url: 'https://developers.facebook.com/docs/marketing-api/conversions-api',
      },
      {
        title: 'Customer Information Parameters',
        url: 'https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters',
      },
    ],
  },
  {
    vendor: 'google_ads',
    displayName: 'Google Ads',
    documentation: [
      {
        title: 'Upload click conversions',
        url: 'https://developers.google.com/google-ads/api/docs/conversions/upload-clicks',
      },
    ],
  },
  {
    vendor: 'tiktok',
    displayName: 'TikTok Events API',
    documentation: [{ title: 'TikTok Business API', url: 'https://business-api.tiktok.com/portal/docs' }],
  },
  {
    vendor: 'snapchat',
    displayName: 'Snapchat',
    documentation: [{ title: 'Snap Marketing API', url: 'https://marketingapi.snapchat.com/docs' }],
  },
  {
    vendor: 'pinterest',
    displayName: 'Pinterest',
    documentation: [{ title: 'Pinterest API', url: 'https://developers.pinterest.com/docs/api/v5/' }],
  },
  {
    vendor: 'linkedin',
    displayName: 'LinkedIn',
    documentation: [
      {
        title: 'Conversions API',
        url: 'https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/conversions-api',
      },
    ],
  },
  {
    vendor: 'x_ads',
    displayName: 'X Ads',
    documentation: [{ title: 'X Ads API', url: 'https://developer.x.com/en/docs/x-ads-api' }],
  },
  {
    vendor: 'reddit',
    displayName: 'Reddit',
    documentation: [{ title: 'Reddit Ads API', url: 'https://ads-api.reddit.com/docs/' }],
  },
  {
    vendor: 'amazon_ads',
    displayName: 'Amazon Ads',
    documentation: [
      {
        title: 'Amazon Advertising API',
        url: 'https://advertising.amazon.com/API/docs/en-us/guides/get-started/overview',
      },
    ],
  },
  {
    vendor: 'criteo',
    displayName: 'Criteo',
    documentation: [{ title: 'Criteo', url: 'https://developers.criteo.com/' }],
  },
  {
    vendor: 'bing_ads',
    displayName: 'Microsoft Advertising',
    documentation: [
      { title: 'MS Advertising', url: 'https://learn.microsoft.com/en-us/advertising/guides/' },
    ],
  },
  {
    vendor: 'klaviyo',
    displayName: 'Klaviyo',
    documentation: [
      { title: 'Klaviyo API', url: 'https://developers.klaviyo.com/en/reference/api_overview' },
    ],
  },
  {
    vendor: 'segment',
    displayName: 'Segment',
    documentation: [
      {
        title: 'HTTP API',
        url: 'https://segment.com/docs/connections/sources/catalog/libraries/server/http-api/',
      },
    ],
  },
  {
    vendor: 'rudderstack',
    displayName: 'RudderStack',
    documentation: [
      {
        title: 'HTTP API',
        url: 'https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-http-api/',
      },
    ],
  },
  {
    vendor: 'braze',
    displayName: 'Braze',
    documentation: [{ title: 'Braze REST', url: 'https://www.braze.com/docs/api/basics/' }],
  },
  {
    vendor: 'amplitude',
    displayName: 'Amplitude',
    documentation: [
      { title: 'HTTP V2', url: 'https://amplitude.com/docs/apis/analytics/http-v2' },
    ],
  },
  {
    vendor: 'mixpanel',
    displayName: 'Mixpanel',
    documentation: [
      { title: 'Ingestion', url: 'https://developer.mixpanel.com/reference/ingestion-api' },
    ],
  },
  {
    vendor: 'hubspot',
    displayName: 'HubSpot',
    documentation: [
      { title: 'Events', url: 'https://developers.hubspot.com/docs/api/analytics/events' },
    ],
  },
  {
    vendor: 'salesforce_mc',
    displayName: 'Salesforce MC',
    documentation: [
      {
        title: 'SFMC REST',
        url: 'https://developer.salesforce.com/docs/marketing/marketing-cloud/guide/rest-api.html',
      },
    ],
  },
  {
    vendor: 'adobe_aep',
    displayName: 'Adobe AEP',
    documentation: [
      {
        title: 'AEP APIs',
        url: 'https://developer.adobe.com/experience-platform-apis/',
      },
    ],
  },
];

export function emptyVendorMap(slot: (typeof VENDOR_SLOTS)[number]): VendorMap {
  return {
    vendor: slot.vendor,
    displayName: slot.displayName,
    version: '0.0.0-empty',
    auth: { type: 'custom', notes: 'Agent sets from docs' },
    endpoint: { method: 'POST', path: '/REPLACE_FROM_DOCS', baseUrl: 'https://REPLACE_FROM_DOCS' },
    intents: {},
    fields: [],
    documentation: slot.documentation,
    status: 'skeleton',
    notes: 'Empty on purpose. Skill: layerkit-research-vendor',
  };
}

export function buildPocVendorMaps(): VendorMap[] {
  return VENDOR_SLOTS.map(emptyVendorMap);
}
