/**
 * Hold-out style planning cases for "research vendor X and produce a proposal".
 * Cases describe prompts + judge criteria; live agent runs are offline.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const casesDir = join(here, 'cases');

interface PlanCase {
  id: string;
  vendor: string;
  prompt: string;
  mustCiteHost: string;
  requiredIntent: string;
}

const cases: PlanCase[] = [
  {
    id: 'meta-purchase-map',
    vendor: 'meta',
    prompt:
      'Research Meta Conversions API docs and draft a layerkit vendor_map proposal for purchase intent including email processing with sources.',
    mustCiteHost: 'developers.facebook.com',
    requiredIntent: 'purchase',
  },
  {
    id: 'google-ads-conversion',
    vendor: 'google_ads',
    prompt:
      'Research Google Ads conversion upload docs and draft a map proposal for purchase with hashed email fields.',
    mustCiteHost: 'developers.google.com',
    requiredIntent: 'purchase',
  },
  {
    id: 'tiktok-complete-payment',
    vendor: 'tiktok',
    prompt:
      'Research TikTok Events API and map commerce purchase intent; cite official docs for event name and user identity fields.',
    mustCiteHost: 'tiktok.com',
    requiredIntent: 'purchase',
  },
];

function main(): void {
  console.log('vendor-research-plan cases (agent offline harness):');
  for (const c of cases) {
    console.log(`- ${c.id}`);
    console.log(`  vendor: ${c.vendor}`);
    console.log(`  must cite host: ${c.mustCiteHost}`);
    console.log(`  required intent: ${c.requiredIntent}`);
    console.log(`  prompt: ${c.prompt}`);
  }
  console.log('');
  console.log('Judge criteria (for human/LLM judge):');
  console.log('1. sources[] include official host');
  console.log('2. No invented hash algorithms without excerpt');
  console.log('3. endpoint path matches docs');
  console.log('4. proposal validates with layerkit proposal validate');
  console.log(`Loaded ${cases.length} plan cases. Live agent scoring is manual/CI-optional.`);
  void casesDir;
  void readFileSync;
}

main();
