/** Injected into agent sessions via hooks. Keep short (context budget). */
export const layerkitHookGuidance = [
  'Layerkit: evidence-first (OpenAPI/docs/curl/code); residual human only; edit client-owned source directly.',
  'Lead: layerkit-orchestrate-integration. Contract heal is agent-owned: read evidence, update existing source/tests, validate explicit artifacts.',
  'Checker-assist read-only. Handoff after package verification and quality gates.',
  'Docs: layerkit cheatsheet, skills/*/SKILL.md. CLI: layerkit / npx layerkit.',
].join(' ');
