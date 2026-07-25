import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { VENDOR_SLOTS } from '../../libs/domain/commerce.js';
import { generatePlanCases, hostnameFromUrl } from './generate-cases.js';

describe('generatePlanCases', () => {
  it('emits one case per catalog vendor (scalable)', () => {
    const cases = generatePlanCases();
    assert.equal(cases.length, VENDOR_SLOTS.length);
    assert.equal(cases.length >= 20, true);
    for (const slot of VENDOR_SLOTS) {
      assert.ok(cases.some((c) => c.vendor === slot.vendor), `missing ${slot.vendor}`);
    }
  });

  it('derives cite hosts from documentation URLs, not a host table', () => {
    const meta = generatePlanCases({ vendor: 'meta' })[0]!;
    assert.ok(meta.mustCiteHosts.includes('developers.facebook.com'));
    assert.ok(meta.documentationUrls.length >= 1);
    assert.ok(meta.prompt.includes(meta.documentationUrls[0]!));
  });

  it('uses the same prompt template structure for every vendor', () => {
    const cases = generatePlanCases();
    for (const c of cases) {
      assert.ok(c.prompt.includes('## Primary documentation'));
      assert.ok(c.prompt.includes('## Deliverable'));
      assert.ok(c.prompt.includes(c.vendor));
    }
  });

  it('hostnameFromUrl strips www', () => {
    assert.equal(hostnameFromUrl('https://www.example.com/a'), 'example.com');
  });
});
