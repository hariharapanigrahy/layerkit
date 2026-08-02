import { layerkitIntentHookLine } from '../agent/intent-help.js';

/** Injected into agent sessions via hooks. Keep short (context budget). */
export const layerkitHookGuidance = [
  layerkitIntentHookLine,
  'Layerkit: evidence-first (OpenAPI/docs/curl/code); residual human only; edit client-owned source directly.',
  'Lead: layerkit-orchestrate-integration after intentional entry (layerkit: … or agent start).',
  'Checker-assist read-only. Handoff after package verification and quality gates.',
  'Docs: layerkit help, layerkit cheatsheet, skills/*/SKILL.md. CLI: layerkit / npx layerkit.',
].join(' ');
