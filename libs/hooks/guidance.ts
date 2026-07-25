/** Injected into agent sessions via hooks. Keep short (context budget). */
export const layerkitHookGuidance = [
  'Layerkit: evidence-first (docs, OpenAPI, curl, code); deepen if unanswered; ask humans only for residual gaps; no LLM on track().',
  'Next: discover-data-layer → research-vendor (multi-source) → proposal validate → generate java.',
  'Also: design-flow (finalize only after quality gates), privacy-review, checker-assist (read-only — never approve/apply).',
  'Docs: skills/*/SKILL.md, {projectDir}/memory/INDEX.md, layerkit doctor.',
].join(' ');
