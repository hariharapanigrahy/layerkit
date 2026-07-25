/**
 * Gate: research-plan generates cases from fixture scenarios.
 */
import { assertTrue } from '../../harness/assert.js';
import { generatePlanCases } from '../../vendor-research-plan/generate-cases.js';

const cases = generatePlanCases();

assertTrue('at least one fixture scenario', cases.length >= 1);

for (const c of cases) {
  assertTrue(`case ${c.id} has vendor`, !!c.vendor);
  assertTrue(`case ${c.id} has prompt`, c.prompt.length > 50);
  assertTrue(`case ${c.id} has judge criteria`, c.judge.length >= 3);
}

const example = cases.find((c) => c.vendor === 'example_vendor');
assertTrue('example_vendor fixture scenario exists', !!example);
if (example) {
  assertTrue('has documentation URLs', example.documentationUrls.length >= 1);
  assertTrue('has mustCiteHosts', example.mustCiteHosts.length >= 1);
}

console.log('vendor-research-plan: all checks passed');
