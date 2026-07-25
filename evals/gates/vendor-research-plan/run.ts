/**
 * Gate: vendor research-plan harness scales with catalog (VENDOR_SLOTS).
 * Not a research-quality judge — only plan-case generation invariants.
 */
import { assertEqual, assertTrue } from '../../harness/assert.js';
import { VENDOR_SLOTS } from '../../../libs/domain/commerce.js';
import { generatePlanCases } from '../../vendor-research-plan/generate-cases.js';

const cases = generatePlanCases();

assertEqual('case count === VENDOR_SLOTS.length', cases.length, VENDOR_SLOTS.length);
assertTrue('catalog has at least 20 slots', VENDOR_SLOTS.length >= 20);

for (const slot of VENDOR_SLOTS) {
  assertTrue(
    `plan case for vendor ${slot.vendor}`,
    cases.some((c) => c.vendor === slot.vendor),
  );
}

const meta = cases.find((c) => c.vendor === 'meta');
assertTrue('meta plan case exists', !!meta);
if (meta) {
  assertTrue('meta has documentation URLs', meta.documentationUrls.length >= 1);
  assertTrue('meta has mustCiteHosts', meta.mustCiteHosts.length >= 1);
  assertTrue('prompt includes primary docs section', meta.prompt.includes('## Primary documentation'));
}

console.log('vendor-research-plan: all checks passed');
