/**
 * Score map coverage quality across vendor slots (field completeness, source density).
 * Does NOT invent field names — only scores agent-produced maps.
 */
import { buildPocVendorMaps } from '../../libs/domain/commerce.js';
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

  const endpointPath = map.endpoint?.path ?? '';
  if (endpointPath && !endpointPath.includes('REPLACE')) {
    score += 5;
    reasons.push('endpoint_set');
  }

  return { vendor: map.vendor, score, reasons };
}

function main(): void {
  const maps = buildPocVendorMaps();
  const scores = maps.map(scoreMap).sort((a, b) => b.score - a.score);
  console.log('Map quality baseline (empty POC slots):');
  for (const s of scores.slice(0, 5)) {
    console.log(`  ${s.vendor}: ${s.score} (${s.reasons.join(', ')})`);
  }
  console.log(`Mean score: ${(scores.reduce((a, b) => a + b.score, 0) / scores.length).toFixed(2)}`);
  console.log('Optimizer trains weights when agent-filled maps are contributed to evals/fixtures.');
}

main();
