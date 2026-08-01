# Agent instructions

## Layerkit

Layerkit: evidence-first (OpenAPI, docs, curl, code); residual human only; no LLM on track().

Master skill: `layerkit-orchestrate-integration`. Multi-agent: `layerkit-multi-agent` + `layerkit agent multi --vendor …`.

Contract update: `layerkit research fill --vendor … --openapi …` then pipeline through generate (`INTEGRATE.md` / `--module-root`).

Checker-assist is read-only — never approve/apply. Promote only after quality gates.

Docs: `layerkit cheatsheet`, `skills/*/SKILL.md`, `{projectDir}/memory/INDEX.md`. CLI: `layerkit` / `npx layerkit`.
