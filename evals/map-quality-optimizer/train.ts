/**
 * Score map coverage quality for agent-produced maps.
 * Does NOT use a vendor catalog — scores maps passed in or empty baseline.
 */
import type { VendorMap, VendorMapV1 } from '../../libs/domain/types.js';

export interface MapQualityScore {
  vendor: string;
  score: number;
  reasons: string[];
}

export function scoreMap(map: VendorMap): MapQualityScore {
  const reasons: string[] = [];
  let score = 0;

  if (map.documentation?.length) {
    score += 10;
    reasons.push('has_docs');
  }
  if (map.status === 'skeleton' || (!map.fields.length && !Object.keys(map.intents).length)) {
    reasons.push('empty_skeleton');
    return { vendor: map.vendor, score, reasons };
  }

  const intentCount = Object.keys(map.intents).length;
  score += Math.min(40, intentCount * 5);
  reasons.push(`intents:${intentCount}`);

  score += Math.min(30, map.fields.length * 3);
  reasons.push(`fields:${map.fields.length}`);

  if (map.endpoint && !map.endpoint.path.includes('REPLACE')) {
    score += 5;
    reasons.push('endpoint_set');
  }

  return { vendor: map.vendor, score, reasons };
}

function main(): void {
  // Baseline: single empty agent skeleton (not a multi-vendor catalog)
  const maps = [
    emptyVendorMapFixture({
      vendor: 'example_vendor',
      displayName: 'Example',
      documentation: [{ title: 'Docs', url: 'https://docs.example.com' }],
    }),
  ];
  const scores = maps.map(scoreMap);
  console.log('Map quality baseline (empty skeleton):');
  for (const s of scores) {
    console.log(`  ${s.vendor}: ${s.score} (${s.reasons.join(', ')})`);
  }
  console.log('Score real maps from customer projectDir after agent research.');
}

function emptyVendorMapFixture(seed: {
  vendor: string;
  displayName: string;
  documentation?: VendorMapV1['documentation'];
}): VendorMapV1 {
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

main();
