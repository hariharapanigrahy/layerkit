/**
 * Build Q1–Q10 answer sheets from evidence. Never invents vendor rules.
 */
import {
  describeAuthFromOpenApi,
  describeEndpointsFromOpenApi,
  parseOpenAPI,
} from './parse-openapi.js';
import { parseCurl } from './parse-curl.js';
import { planDeepen } from './deepen.js';
import type {
  AnswerSheet,
  DimensionAnswer,
  DimensionId,
  ResearchSeed,
  ResidualGap,
} from './types.js';
import { DIMENSION_TOPICS } from './types.js';

const ALL_IDS: DimensionId[] = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9', 'Q10'];

function emptyDimension(id: DimensionId): DimensionAnswer {
  return {
    id,
    topic: DIMENSION_TOPICS[id],
    answer: '',
    source: 'unanswered',
    confidence: 'none',
    citations: [],
    humanAsked: false,
  };
}

export function createEmptyAnswerSheet(vendor?: string): AnswerSheet {
  const dimensions = {} as Record<DimensionId, DimensionAnswer>;
  for (const id of ALL_IDS) {
    dimensions[id] = emptyDimension(id);
  }
  return { vendor, dimensions, deepenLog: [] };
}

/**
 * Fill answer sheet from seeds. Only fills dimensions with explicit evidence.
 * Empty seeds → all dimensions remain unanswered / needs-evidence (no invention).
 */
export function fillAnswerSheetFromEvidence(
  seeds: ResearchSeed[],
  opts?: { vendor?: string },
): AnswerSheet {
  const sheet = createEmptyAnswerSheet(opts?.vendor);

  if (!seeds.length) {
    // Explicit: mark as needs-evidence, never fabricate endpoints/auth
    for (const id of ALL_IDS) {
      sheet.dimensions[id] = {
        ...emptyDimension(id),
        source: 'needs-evidence',
        confidence: 'none',
        answer: '',
        humanAsked: false,
      };
    }
    sheet.deepenLog.push({
      level: 0,
      action: 'no_seeds',
      detail: 'Empty evidence bag — residual gaps only; do not invent',
    });
    return sheet;
  }

  const deepen = planDeepen(seeds);
  sheet.deepenLog.push(...deepen.deepenLog);

  for (const seed of seeds) {
    if (seed.kind === 'openapi') {
      const content = seed.content;
      if (!content) continue;
      const parsed = parseOpenAPI(content);
      const auth = describeAuthFromOpenApi(parsed);
      const endpoints = describeEndpointsFromOpenApi(parsed);

      if (auth) {
        sheet.dimensions.Q1 = {
          id: 'Q1',
          topic: DIMENSION_TOPICS.Q1,
          answer: auth,
          source: 'openapi',
          confidence: 'high',
          citations: [{ title: seed.urlOrPath, excerpt: auth }],
          humanAsked: false,
        };
      }
      if (endpoints) {
        sheet.dimensions.Q2 = {
          id: 'Q2',
          topic: DIMENSION_TOPICS.Q2,
          answer: endpoints,
          source: 'openapi',
          confidence: 'high',
          citations: [{ title: seed.urlOrPath, excerpt: endpoints }],
          humanAsked: false,
        };
      }
    }

    if (seed.kind === 'curl') {
      const parsed = parseCurl(seed.command);
      if (parsed.authClass !== 'none') {
        const authAnswer = `Authorization class: ${parsed.authClass}` +
          (parsed.headers['Authorization'] || parsed.headers['authorization']
            ? ` (header present)`
            : '');
        // Prefer openapi if already high; else fill from curl
        if (sheet.dimensions.Q1.source === 'unanswered' || sheet.dimensions.Q1.source === 'needs-evidence') {
          sheet.dimensions.Q1 = {
            id: 'Q1',
            topic: DIMENSION_TOPICS.Q1,
            answer: authAnswer,
            source: 'curl',
            confidence: 'high',
            citations: [{ excerpt: `${parsed.method} ${parsed.url}` }],
            humanAsked: false,
          };
        }
      }
      if (parsed.url) {
        const ep = `${parsed.method} ${parsed.protocol}://${parsed.host}${parsed.path}`;
        if (sheet.dimensions.Q2.source === 'unanswered' || sheet.dimensions.Q2.source === 'needs-evidence') {
          sheet.dimensions.Q2 = {
            id: 'Q2',
            topic: DIMENSION_TOPICS.Q2,
            answer: ep,
            source: 'curl',
            confidence: 'high',
            citations: [{ url: parsed.url, excerpt: ep }],
            humanAsked: false,
          };
        }
      }
    }
  }

  // Dimensions still empty stay unanswered (not human-asked; residualGaps handles prompts)
  for (const id of ALL_IDS) {
    if (!sheet.dimensions[id].answer && sheet.dimensions[id].source === 'unanswered') {
      // leave as unanswered
    }
  }

  return sheet;
}

/**
 * Residual gaps after evidence + deepen: only dimensions still unanswered /
 * needs-evidence / low confidence. Prefer residual questionnaire over inventing.
 */
export function residualGaps(sheet: AnswerSheet): ResidualGap[] {
  const gaps: ResidualGap[] = [];
  for (const id of ALL_IDS) {
    const d = sheet.dimensions[id];
    if (d.source === 'needs-evidence' || d.source === 'unanswered' || !d.answer) {
      gaps.push({
        id,
        topic: d.topic,
        reason: d.source === 'needs-evidence' ? 'needs-evidence' : 'unanswered',
        suggestedQuestion: `What is the vendor ${d.topic.toLowerCase()}? (evidence silent)`,
      });
      continue;
    }
    if (d.confidence === 'low') {
      gaps.push({
        id,
        topic: d.topic,
        reason: 'low_confidence',
        suggestedQuestion: `Confirm ${d.topic.toLowerCase()}: ${d.answer}`,
      });
    }
  }
  return gaps;
}

/**
 * True if sheet fabricates an endpoint (defensive check for gates).
 * A fabricated endpoint would appear without openapi/curl/doc source.
 */
export function hasInventedEndpoint(sheet: AnswerSheet): boolean {
  const q2 = sheet.dimensions.Q2;
  if (!q2.answer) return false;
  if (q2.source === 'openapi' || q2.source === 'curl' || q2.source === 'doc' || q2.source === 'code') {
    return false;
  }
  // answer present but source not evidence → invented
  return true;
}
