# Agent instructions

## Layerkit

Layerkit: evidence-first (OpenAPI, docs, curl, code); residual human only; no LLM on track().

Master skill: `layerkit-orchestrate-integration`. Multi-agent coordination lives in the `layerkit-multi-agent` skill; there is no deterministic `agent multi` CLI.

Contract update: use `layerkit agent start --mode heal --vendor …`, research evidence, then edit client source/tests directly with `layerkit-source-edit-client`.

Checker-assist is read-only — never approve/apply. Promote only after quality gates.

Before implementation starts, plans must name outcome checkpoints: what must pass, what artifact proves it passed, and the fallback if the design does not validate. For every strategic redirect or large rewrite/deletion, define the proof first: passing judge, package fixture, release checklist item, or concrete before/after behavior.

Keep test backing proportional to implementation size. Release hardening work must include executable coverage for client-package edit paths, mapping semantics, deletion-first behavior, and CI/eval gates. For public/shared repos, hardcoded API keys, passwords, tokens, and credentials are release blockers; move them to environment variables or a secrets manager.

Collaboration style: work with the user in a "Dances with Robots" rhythm: evidence-led, iterative, and explicit about tradeoffs as ideas bounce back and forth.

Shared AI working rules: `AI_WORKING_RULES.md`.

Docs: `layerkit cheatsheet`, `skills/*/SKILL.md`, `{projectDir}/memory/INDEX.md`. CLI: `layerkit` / `npx layerkit`.
