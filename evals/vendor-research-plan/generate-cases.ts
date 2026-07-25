/**
 * Agent research-plan cases from **eval fixtures only** — not a vendor catalog.
 * Scenarios live in evals/fixtures/agent/research-scenarios.json.
 * Product agents research any customer-chosen vendor; this harness only
 * checks that plan prompts can be generated from scenario fixtures.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMERCE_DOMAIN } from '../../libs/domain/commerce.js';
import type { DomainSpec, DocSource } from '../../libs/domain/types.js';

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

/** Universal process judge — not vendor-specific truth */
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
  const path = join(here, '../fixtures/agent/research-scenarios.json');
  return JSON.parse(readFileSync(path, 'utf8')) as ResearchScenario[];
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
    `Author a customer-owned vendor map for vendor id "${scenario.vendor}" (${scenario.displayName}).`,
    `This is NOT a Layerkit catalog entry — maps live in the customer's projectDir only.`,
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
    '- Treating Layerkit as a pre-built vendor catalog',
  ].join('\n');
}

export interface GeneratePlanCasesOptions {
  domain?: DomainSpec;
  scenarios?: readonly ResearchScenario[];
  vendor?: string;
  intents?: string[];
  limit?: number;
}

/**
 * Generate agent research plan cases from fixture scenarios (eval-only).
 */
export function generatePlanCases(opts: GeneratePlanCasesOptions = {}): PlanCase[] {
  const domain = opts.domain ?? COMMERCE_DOMAIN;
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
