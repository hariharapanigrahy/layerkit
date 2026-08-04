/**
 * Layer B2: agent-run judge — did the agent run meet scenario gold?
 * Process + specs + routing + mapper + model + terminal + pipeline.
 */
import type {
  AgentRun,
  AgentTranscript,
  RubricCheck,
  RunGold,
  TranscriptStep,
} from './types.js';

const INVENT_MARKERS: RegExp[] = [
  /\[INVENT\]/i,
  /\binvented\b/i,
  /\binventing\b/i,
  /\bno evidence[;:,]?\s*(guess|fabricat)/i,
  /TODO\s*invent/i,
  /\bfabricated\b/i,
  /\bguess(?:ed|ing)?\s+without\s+evidence\b/i,
];

const INVENT_VENDOR_RE = /^(invent_|guessed_|unknown$|unknown\.|unknown\/)/i;
const CLIENT_PR_URL_RE =
  /https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/\d+/i;

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

function hostnameFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function scoreProcess(transcript: AgentTranscript): {
  ok: boolean;
  checks: RubricCheck[];
} {
  const checks: RubricCheck[] = [];
  if (!transcript?.steps || !Array.isArray(transcript.steps)) {
    return {
      ok: false,
      checks: [{ id: 'shape', ok: false, detail: 'transcript.steps required' }],
    };
  }

  for (const step of transcript.steps) {
    const claim = typeof step.claim === 'string' ? step.claim.trim() : '';
    if (!claim) continue;
    const ok = hasUsableSource(step);
    checks.push({
      id: `citations:${step.id}`,
      ok,
      detail: ok ? undefined : 'claim without sources',
    });
  }

  for (const step of transcript.steps) {
    const flag = step.invent === true;
    const marker = INVENT_MARKERS.some((re) => re.test(stepText(step)));
    const ok = !flag && !marker;
    checks.push({
      id: `no-invent:${step.id}`,
      ok,
      detail: flag ? 'invent=true' : marker ? 'invent marker text' : undefined,
    });
  }

  for (const step of transcript.steps) {
    if (step.askedHuman !== true) continue;
    const ok = step.deepened === true;
    checks.push({
      id: `deepen-before-human:${step.id}`,
      ok,
      detail: ok ? undefined : 'askedHuman without deepened',
    });
  }

  return { ok: checks.every((c) => c.ok), checks };
}

export function scoreAgentRun(
  run: AgentRun,
  gold: RunGold,
): { ok: boolean; checks: RubricCheck[] } {
  const process = scoreProcess(run.transcript);
  const checks: RubricCheck[] = [...process.checks];
  const art = run.artifacts ?? {};

  // specs
  const hostsRequired = new Set(gold.mustCiteHosts.map((h) => h.toLowerCase()));
  const cited = new Set<string>();
  for (const step of run.transcript.steps) {
    for (const s of step.sources ?? []) {
      if (s.url) {
        const h = hostnameFromUrl(s.url);
        if (h) cited.add(h);
      }
    }
  }
  for (const url of art.documentationUrls ?? []) {
    const h = hostnameFromUrl(url);
    if (h) cited.add(h);
  }
  const specsOk =
    hostsRequired.size === 0 ||
    [...hostsRequired].some(
      (req) => cited.has(req) || [...cited].some((h) => h === req || h.endsWith(`.${req}`)),
    );
  checks.push({
    id: 'specs:must-cite-hosts',
    ok: specsOk,
    detail: specsOk
      ? undefined
      : `need hosts [${[...hostsRequired].join(',')}] cited=[${[...cited].join(',')}]`,
  });

  // routing
  const intents = art.mapIntents ?? {};
  const ops = new Set(art.mapOperations ?? []);
  for (const [intent, b] of Object.entries(intents)) {
    if (!b.skip && !b.eventName) {
      checks.push({
        id: `routing:event_name:${intent}`,
        ok: false,
        detail: 'needs eventName or skip',
      });
    }
    if (!b.skip && b.operationId && ops.size > 0 && !ops.has(b.operationId)) {
      checks.push({
        id: `routing:operation_missing:${intent}`,
        ok: false,
        detail: `operationId ${b.operationId} missing`,
      });
    }
  }
  if (!checks.some((c) => c.id.startsWith('routing:') && !c.ok)) {
    checks.push({ id: 'routing:ok', ok: true });
  }

  // mapper
  const fields = art.mapFields ?? [];
  if (fields.length < gold.mapFieldsMin) {
    checks.push({
      id: 'mapper:min-fields',
      ok: false,
      detail: `need ≥${gold.mapFieldsMin} fields, got ${fields.length}`,
    });
  }
  if (gold.forbidInventFieldPaths) {
    for (const f of fields) {
      if (INVENT_VENDOR_RE.test(f.vendor ?? '')) {
        checks.push({
          id: `mapper:invent:${f.vendor}`,
          ok: false,
          detail: 'invent/guessed/unknown vendor path',
        });
      }
    }
  }
  if (!checks.some((c) => c.id.startsWith('mapper:') && !c.ok)) {
    checks.push({ id: 'mapper:ok', ok: true });
  }

  // model
  if (gold.mapFieldsMin > 0 && fields.length === 0 && Object.keys(intents).length === 0) {
    checks.push({ id: 'model:empty-map', ok: false, detail: 'expected fields or intents' });
  } else {
    checks.push({ id: 'model:ok', ok: true });
  }

  // terminal
  const prFromArt = art.prUrl && CLIENT_PR_URL_RE.test(art.prUrl) ? art.prUrl : null;
  const prFromNotes = run.transcript.steps
    .map((s) => stepText(s))
    .join('\n')
    .match(CLIENT_PR_URL_RE)?.[0];
  const hasPr = Boolean(prFromArt || prFromNotes);
  const residualOk =
    art.residualNoPr === true &&
    art.allowResidualNoPr === true &&
    typeof art.residualNote === 'string' &&
    art.residualNote.trim().length > 0;

  if (gold.forbidStoreOnlyHandoff) {
    if (gold.requirePrUrl) {
      checks.push({
        id: 'terminal:client-pr',
        ok: hasPr,
        detail: hasPr ? undefined : 'require github.com/.../pull/N',
      });
      const paths = art.sourceEditPaths ?? [];
      const residualEdit = art.residualNoFieldEdit === true;
      const sourceOk = paths.length > 0 || residualEdit;
      checks.push({
        id: 'terminal:source-edit',
        ok: sourceOk,
        detail: sourceOk ? undefined : 'need sourceEditPaths or residualNoFieldEdit',
      });
      // Pin-only PR is not mergeable integrate (apiVersion/package.json only + no fields)
      const onlyPinPaths =
        paths.length > 0 &&
        paths.every((p) => /package\.json$|lock|apiVersion|\.version/i.test(p));
      if (onlyPinPaths && fields.length === 0 && !residualEdit) {
        checks.push({
          id: 'terminal:pin-only-not-integrate',
          ok: false,
          detail:
            'apiVersion/package.json-only with empty field map is not full integrate',
        });
      }
    } else if (gold.allowResidualNoPr) {
      const ok = residualOk || hasPr;
      checks.push({
        id: 'terminal:residual-or-pr',
        ok,
        detail: ok ? undefined : 'need residual break-glass or PR',
      });
    }
  }

  // pipeline
  const present = new Set(
    run.transcript.steps
      .map((s) => s.pipelineStep)
      .filter((x): x is string => typeof x === 'string'),
  );
  for (const step of gold.requiredPipelineSteps) {
    checks.push({
      id: `pipeline:${step}`,
      ok: present.has(step),
      detail: present.has(step) ? undefined : `missing ${step}`,
    });
  }

  return { ok: checks.every((c) => c.ok), checks };
}
