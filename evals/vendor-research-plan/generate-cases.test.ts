import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generatePlanCases, hostnameFromUrl } from './generate-cases.js';

describe('generatePlanCases', () => {
  it('loads fixture scenarios', () => {
    const cases = generatePlanCases();
    assert.ok(cases.length >= 1, 'at least one fixture scenario');
    for (const c of cases) {
      assert.ok(c.prompt.includes('## Primary documentation'));
      assert.ok(c.judge.length > 0);
    }
  });

  it('filter by vendor id', () => {
    const cases = generatePlanCases({ vendor: 'example_vendor' });
    assert.equal(cases.length, 1);
    assert.equal(cases[0]!.vendor, 'example_vendor');
  });

  it('hostnameFromUrl strips www', () => {
    assert.equal(hostnameFromUrl('https://www.example.com/x'), 'example.com');
    assert.equal(hostnameFromUrl('not-a-url'), null);
  });
});
