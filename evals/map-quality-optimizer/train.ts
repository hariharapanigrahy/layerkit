/**
 * Score map coverage quality for agent-produced maps.
 * Does NOT use a vendor catalog — scores maps passed in or empty baseline.
 */
import { emptyVendorMap } from '../../libs/domain/commerce.js';
import type { VendorMap } from '../../libs/domain/types.js';

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

  const withProcessor = map.fields.filter((f) => f.transform.type === 'processor').length;
  score += Math.min(15, withProcessor * 3);
  reasons.push(`processors:${withProcessor}`);

  if (map.endpoint && !map.endpoint.path.includes('REPLACE')) {
    score += 5;
    reasons.push('endpoint_set');
  }

  return { vendor: map.vendor, score, reasons };
}

function main(): void {
  // Baseline: single empty agent skeleton (not a multi-vendor catalog)
  const maps = [
    emptyVendorMap({
      vendor: 'example_vendor',
      displayName: 'Example',
      documentation: [{ title: 'Docs', url: 'https://docs.example.com' }],
    }),
  ];
  const scores = maps.map(scoreMap);
  console.log('Map quality baseline (empty agent skeleton — not a catalog):');
  for (const s of scores) {
    console.log(`  ${s.vendor}: ${s.score} (${s.reasons.join(', ')})`);
  }
  console.log('Score real maps from customer projectDir after agent research.');
}

main();
