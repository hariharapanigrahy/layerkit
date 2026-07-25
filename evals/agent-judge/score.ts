/**
 * Deterministic rubric scorer for recorded agent transcripts.
 *
 * Rubric dimensions:
 * 1. citations present — every non-empty claim has ≥1 source (url|title|excerpt)
 * 2. no invent markers — invent!==true and no invent text markers in claim/notes/action
 * 3. deepen-before-human — any askedHuman step must have deepened===true
 */
import type { AgentTranscript, RubricCheck, ScoreResult, TranscriptStep } from './types.js';

/** Text patterns that flag silent invention / guessing. */
const INVENT_MARKERS: RegExp[] = [
  /\[INVENT\]/i,
  /\binvented\b/i,
  /\binventing\b/i,
  /\bno evidence[;:,]?\s*(guess|fabricat)/i,
  /TODO\s*invent/i,
  /\bfabricated\b/i,
  /\bguess(?:ed|ing)?\s+without\s+evidence\b/i,
];

function hasUsableSource(step: TranscriptStep): boolean {
  if (!Array.isArray(step.sources) || step.sources.length === 0) return false;
  return step.sources.some(
    (s) =>
      (typeof s.url === 'string' && s.url.trim().length > 0) ||
      (typeof s.title === 'string' && s.title.trim().length > 0) ||
      (typeof s.excerpt === 'string' && s.excerpt.trim().length > 0),
  );
}

function stepText(step: TranscriptStep): string {
  return [step.action, step.claim, step.notes].filter(Boolean).join('\n');
}

function hasInventMarkerText(step: TranscriptStep): boolean {
  const text = stepText(step);
  return INVENT_MARKERS.some((re) => re.test(text));
}

/**
 * Score one transcript against the fixed process rubric.
 * Returns ok=true only when every check passes.
 */
export function scoreTranscript(transcript: AgentTranscript): ScoreResult {
  if (!transcript || !Array.isArray(transcript.steps)) {
    return {
      transcriptId: transcript?.id ?? '(invalid)',
      ok: false,
      checks: [{ id: 'shape', ok: false, detail: 'transcript.steps must be an array' }],
      citationsOk: false,
      noInventOk: false,
      deepenBeforeHumanOk: false,
    };
  }

  const checks: RubricCheck[] = [];

  // --- 1. Citations present for every claim ---
  for (const step of transcript.steps) {
    const claim = typeof step.claim === 'string' ? step.claim.trim() : '';
    if (!claim) continue;
    const ok = hasUsableSource(step);
    checks.push({
      id: `citations:${step.id}`,
      ok,
      detail: ok ? undefined : 'claim present without usable sources[]',
    });
  }

  // --- 2. No invent markers ---
  for (const step of transcript.steps) {
    const flag = step.invent === true;
    const marker = hasInventMarkerText(step);
    const ok = !flag && !marker;
    let detail: string | undefined;
    if (flag) detail = 'invent=true';
    else if (marker) detail = 'invent text marker in claim/notes/action';
    checks.push({
      id: `no-invent:${step.id}`,
      ok,
      detail,
    });
  }

  // --- 3. Deepen-before-human ---
  for (const step of transcript.steps) {
    if (step.askedHuman !== true) continue;
    const ok = step.deepened === true;
    checks.push({
      id: `deepen-before-human:${step.id}`,
      ok,
      detail: ok ? undefined : 'askedHuman without deepened=true',
    });
  }

  const citationsOk = checks.filter((c) => c.id.startsWith('citations:')).every((c) => c.ok);
  // If there were no claim steps, treat citations as vacuously ok only when steps exist
  // and none failed — empty claim set is ok for deepen/invent-only transcripts.
  const citationChecks = checks.filter((c) => c.id.startsWith('citations:'));
  const citationsOkFinal = citationChecks.length === 0 ? true : citationsOk;

  const inventChecks = checks.filter((c) => c.id.startsWith('no-invent:'));
  const noInventOk = inventChecks.length === 0 ? true : inventChecks.every((c) => c.ok);

  const deepenChecks = checks.filter((c) => c.id.startsWith('deepen-before-human:'));
  const deepenBeforeHumanOk = deepenChecks.length === 0 ? true : deepenChecks.every((c) => c.ok);

  const ok = checks.every((c) => c.ok);

  return {
    transcriptId: transcript.id,
    ok,
    checks,
    citationsOk: citationsOkFinal,
    noInventOk,
    deepenBeforeHumanOk,
  };
}

/** Format a score result for console (one line per check). */
export function formatScore(result: ScoreResult): string {
  const lines: string[] = [
    `transcript=${result.transcriptId} overall=${result.ok ? 'PASS' : 'FAIL'}`,
    `  citations=${result.citationsOk ? 'ok' : 'FAIL'} no-invent=${result.noInventOk ? 'ok' : 'FAIL'} deepen-before-human=${result.deepenBeforeHumanOk ? 'ok' : 'FAIL'}`,
  ];
  for (const c of result.checks) {
    const tag = c.ok ? 'PASS' : 'FAIL';
    lines.push(`  ${tag} ${c.id}${c.detail ? `: ${c.detail}` : ''}`);
  }
  return lines.join('\n');
}
