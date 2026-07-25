/**
 * Data-driven plan cases: one research task per catalog vendor slot.
 * Adding a vendor to libs/domain/commerce.ts (VENDOR_SLOTS) automatically
 * expands this harness — no per-vendor case tables.
 */
import {
  COMMERCE_DOMAIN,
  VENDOR_SLOTS,
  type VendorSlot,
} from '../../libs/domain/commerce.js';
import type { DomainSpec } from '../../libs/domain/types.js';

export interface PlanCase {
  id: string;
  vendor: string;
  displayName: string;
  /** Hostnames that sources[] must hit (derived from documentation URLs) */
  mustCiteHosts: string[];
  /** Primary doc URLs the agent must open */
  documentationUrls: string[];
  /** Domain intents to attempt (skip allowed with reason in proposal) */
  intents: string[];
  /** Domain field paths agents should try to map when docs support them */
  domainFields: string[];
  /** Fully rendered agent prompt (template, not hand-written per vendor) */
  prompt: string;
  judge: readonly string[];
}

/** Universal judge — same for every vendor */
export const UNIVERSAL_JUDGE: readonly string[] = [
  'sources[] cite at least one host from mustCiteHosts (from official documentation URLs)',
  'No invented email/phone/hash rules without a quoted excerpt in sources',
  'endpoint.path and auth.type match cited documentation (no REPLACE placeholders)',
  'proposal passes `layerkit proposal validate` (schema + sources gate)',
  'intents not supported by docs use skip:true with a short note, not guessed event names',
];

export function hostnameFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    // strip leading www.
    return host.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function buildResearchPrompt(opts: {
  slot: VendorSlot;
  domain: DomainSpec;
  intents: string[];
  domainFields: string[];
}): string {
  const { slot, domain, intents, domainFields } = opts;
  const docLines = slot.documentation
    .map((d, i) => `${i + 1}. ${d.title}: ${d.url}`)
    .join('\n');

  return [
    `You are filling a Layerkit vendor map for vendor id "${slot.vendor}" (${slot.displayName}).`,
    '',
    '## Primary documentation (open these; do not invent URLs)',
    docLines || '(no documentation URLs on slot — mark proposal blocked)',
    '',
    `## Domain`,
    `- domain id: ${domain.id}`,
    `- intents to cover when docs support them: ${intents.join(', ')}`,
    `- fields to map when docs support them: ${domainFields.join(', ')}`,
    '',
    '## Deliverable',
    'Draft one Layerkit proposal JSON (schemaVersion 1, kind vendor_map) that:',
    '1. Sets real endpoint + auth from the docs above',
    '2. Maps each supported intent to the vendor event/action name (or skip:true with reason)',
    '3. Maps domain fields to vendor paths with transforms only when docs specify processing',
    '4. Includes sources[] with { title, url, excerpt } for every non-obvious rule',
    '',
    '## Forbidden',
    '- Copying another vendor\'s field table',
    '- Inventing SHA256/E.164 rules without a cited excerpt',
    '- Filling placeholders without reading the docs',
  ].join('\n');
}

export interface GeneratePlanCasesOptions {
  domain?: DomainSpec;
  slots?: readonly VendorSlot[];
  /** Filter to one vendor id */
  vendor?: string;
  /** Override intents (default: all domain intents) */
  intents?: string[];
  /** Cap count (for sampling evals) */
  limit?: number;
}

/**
 * Generate plan cases from the vendor catalog + domain.
 * O(n) in number of slots — scales when catalog grows.
 */
export function generatePlanCases(opts: GeneratePlanCasesOptions = {}): PlanCase[] {
  const domain = opts.domain ?? COMMERCE_DOMAIN;
  let slots = [...(opts.slots ?? VENDOR_SLOTS)];
  if (opts.vendor) {
    slots = slots.filter((s) => s.vendor === opts.vendor);
  }
  if (opts.limit != null && opts.limit >= 0) {
    slots = slots.slice(0, opts.limit);
  }

  const intents = opts.intents ?? domain.intents.map((i) => i.id);
  const domainFields = domain.fields.map((f) => f.path);

  return slots.map((slot) => {
    const documentationUrls = slot.documentation.map((d) => d.url);
    const hosts = new Set<string>();
    for (const url of documentationUrls) {
      const h = hostnameFromUrl(url);
      if (h) hosts.add(h);
    }

    return {
      id: `${slot.vendor}-map`,
      vendor: slot.vendor,
      displayName: slot.displayName,
      mustCiteHosts: [...hosts].sort(),
      documentationUrls,
      intents,
      domainFields,
      prompt: buildResearchPrompt({ slot, domain, intents, domainFields }),
      judge: UNIVERSAL_JUDGE,
    };
  });
}
