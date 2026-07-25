/** Injected into agent sessions via hooks. */
export const layerkitHookGuidance = [
  'Layerkit is an agent-first multi-vendor data-layer toolkit.',
  'Evidence-first: docs, OpenAPI, curl, code — deepen before humans; never invent vendor rules.',
  'Before inventing field names or email/phone hashing, run Layerkit skills:',
  '- layerkit-research-vendor — multi-source evidence → map proposal with sources[]',
  '- layerkit-author-processor — processing rules only with documentation citations',
  '- layerkit-generate-java — implement enterprise Java client from applied maps',
  '- layerkit-update-maps — refresh maps when docs change',
  'CLI: layerkit proposal validate|apply, layerkit doctor, layerkit generate --lang java',
  'Memory: {projectDir}/memory (INDEX.md); observation sinks are runtime telemetry, not memory.',
  'Maps start empty; agents author knowledge. Production JVM must not call an LLM.',
].join(' ');
