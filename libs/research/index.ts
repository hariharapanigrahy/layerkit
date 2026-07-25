export type {
  AnswerConfidence,
  AnswerSheet,
  DeepenLogEntry,
  DeepenPlan,
  DimensionAnswer,
  DimensionId,
  EvidenceSourceKind,
  ParsedCurl,
  ParsedOpenApi,
  ParsedOpenApiOperation,
  ParsedOpenApiProperty,
  ResearchSeed,
  ResidualGap,
} from './types.js';
export { DIMENSION_TOPICS } from './types.js';

export {
  parseOpenAPI,
  collectXExtensions,
  describeAuthFromOpenApi,
  describeEndpointsFromOpenApi,
  describeIntentCandidatesFromOpenApi,
  describeFieldsFromOpenApi,
  describePiiFieldHintsFromOpenApi,
} from './parse-openapi.js';

export { parseCurl } from './parse-curl.js';

export { planDeepen, deepenFromHubMarkdown } from './deepen.js';

export {
  createEmptyAnswerSheet,
  fillAnswerSheetFromEvidence,
  residualGaps,
  hasInventedEndpoint,
} from './answer-sheet.js';
