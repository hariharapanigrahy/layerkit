/** Injected into agent sessions via hooks. Keep short (context budget). */
export const layerkitHookGuidance = [
  'Layerkit: evidence-first (docs, OpenAPI, curl, code); deepen if unanswered; residual human only; no LLM on track().',
  'Master skill: layerkit-orchestrate-integration (discover → research → design → author → privacy → dry-run/fix → generate → checker).',
  'Checker-assist is read-only — never approve/apply. Promote only after quality gates.',
  'Docs: skills/*/SKILL.md, {projectDir}/memory/INDEX.md, layerkit doctor.',
].join(' ');
