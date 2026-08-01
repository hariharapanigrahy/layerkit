# Agent instructions

## Layerkit

Layerkit: evidence-first (OpenAPI, docs, curl, code); residual human only; no LLM on track().

Master skill: `layerkit-orchestrate-integration`. Multi-agent coordination lives in the `layerkit-multi-agent` skill; there is no deterministic `agent multi` CLI.

Contract update: use `layerkit agent start --mode heal --vendor …`, research evidence, then edit client source/tests directly with `layerkit-source-edit-client`.

Checker-assist is read-only — never approve/apply. Promote only after quality gates.

Docs: `layerkit cheatsheet`, `skills/*/SKILL.md`, `{projectDir}/memory/INDEX.md`. CLI: `layerkit` / `npx layerkit`.
