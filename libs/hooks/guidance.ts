/** Injected into agent sessions via hooks (greplica pattern). */
export const layerkitHookGuidance = [
  'Layerkit is an agent-first multi-vendor data-layer toolkit.',
  'Before inventing vendor field names or email/phone hashing, run Layerkit skills:',
  '- layerkit-research-vendor — primary vendor docs → map proposal with sources[]',
  '- layerkit-author-processor — processing rules only with documentation citations',
  '- layerkit-generate-java — implement enterprise Java client from applied maps',
  '- layerkit-update-maps — refresh maps when docs change',
  'CLI: layerkit proposal validate|apply, layerkit doctor, layerkit generate --lang java',
  'Maps start empty; agents author knowledge. Production JVM must not call an LLM.',
].join(' ');
