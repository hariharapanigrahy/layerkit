/**
 * Research-plan cases from evals/fixtures/agent/research-scenarios.json.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DomainSpec, DocSource } from '../../libs/domain/types.js';

const EVAL_DOMAIN: DomainSpec = {
  id: 'eval-commerce',
  version: '1.0.0',
  description: 'Eval-only commerce-like domain for research prompt generation.',
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
    { path: 'products', type: 'array<object>', description: 'Line items' },
    { path: 'value.amount', type: 'number', description: 'Value' },
    { path: 'value.currency', type: 'string', description: 'Currency' },
    { path: 'context.url', type: 'string', description: 'URL' },
  ],
};

export interface ResearchScenario {
  id: string;
  vendor: string;
  displayName: string;
  documentation: DocSource[];
}

export interface PlanCase {
  id: string;
  vendor: string;
  displayName: string;
  mustCiteHosts: string[];
  documentationUrls: string[];
  intents: string[];
  domainFields: string[];
  prompt: string;
  judge: readonly string[];
}

export const UNIVERSAL_JUDGE: readonly string[] = [
  'sources[] cite at least one host from mustCiteHosts (from scenario documentation URLs)',
  'No invented email/phone/hash rules without a quoted excerpt in sources',
  'endpoint.path and auth.type match cited documentation (no REPLACE placeholders)',
  'proposal passes layerkit proposal validate (schema + sources gate)',
  'intents not supported by docs use skip:true with a short note, not guessed event names',
];

export function hostnameFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function loadScenarios(): ResearchScenario[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, '../fixtures/agent/research-scenarios.json'),
    join(here, '../../evals/fixtures/agent/research-scenarios.json'),
    join(process.cwd(), 'evals/fixtures/agent/research-scenarios.json'),
  ];
  for (const path of candidates) {
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as ResearchScenario[];
    } catch {
      /* try next */
    }
  }
  throw new Error('research-scenarios.json not found under evals/fixtures/agent/');
}

export function buildResearchPrompt(opts: {
  scenario: ResearchScenario;
  domain: DomainSpec;
  intents: string[];
  domainFields: string[];
}): string {
  const { scenario, domain, intents, domainFields } = opts;
  const docLines = scenario.documentation
    .map((d, i) => `${i + 1}. ${d.title}: ${d.url}`)
    .join('\n');

  return [
    `You are an integration developer using Layerkit.`,
    `Author a vendor map for vendor id "${scenario.vendor}" (${scenario.displayName}).`,
    '',
    '## Primary documentation (open these; do not invent URLs)',
    docLines || '(no documentation URLs — mark proposal blocked)',
    '',
    `## Domain`,
    `- domain id: ${domain.id}`,
    `- intents to cover when docs support them: ${intents.join(', ')}`,
    `- fields to map when docs support them: ${domainFields.join(', ')}`,
    '',
    '## Deliverable',
    'Draft one Layerkit proposal JSON (kind vendor_map) that:',
    '1. Sets real endpoint + auth from the docs above',
    '2. Maps each supported intent (or skip:true with reason)',
    '3. Maps domain fields only when docs support them',
    '4. Includes sources[] with { title, url, excerpt } for every non-obvious rule',
    '',
    '## Forbidden',
    '- Inventing hash/phone rules without a cited excerpt',
    '- Filling placeholders without reading the docs',
  ].join('\n');
}

export interface GeneratePlanCasesOptions {
  domain?: DomainSpec;
  scenarios?: readonly ResearchScenario[];
  vendor?: string;
  intents?: string[];
  limit?: number;
}

export function generatePlanCases(opts: GeneratePlanCasesOptions = {}): PlanCase[] {
  const domain = opts.domain ?? EVAL_DOMAIN;
  let scenarios = [...(opts.scenarios ?? loadScenarios())];
  if (opts.vendor) {
    scenarios = scenarios.filter((s) => s.vendor === opts.vendor);
  }
  if (opts.limit != null && opts.limit >= 0) {
    scenarios = scenarios.slice(0, opts.limit);
  }

  const intents = opts.intents ?? domain.intents.map((i) => i.id);
  const domainFields = domain.fields.map((f) => f.path);

  return scenarios.map((scenario) => {
    const documentationUrls = scenario.documentation.map((d) => d.url);
    const hosts = new Set<string>();
    for (const url of documentationUrls) {
      const h = hostnameFromUrl(url);
      if (h) hosts.add(h);
    }

    return {
      id: `research-${scenario.id}`,
      vendor: scenario.vendor,
      displayName: scenario.displayName,
      mustCiteHosts: [...hosts],
      documentationUrls,
      intents,
      domainFields,
      prompt: buildResearchPrompt({ scenario, domain, intents, domainFields }),
      judge: UNIVERSAL_JUDGE,
    };
  });
}
