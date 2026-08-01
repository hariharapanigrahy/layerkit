---
name: layerkit-orchestrate-integration
description: Master skill — same pipeline for first integrate and contract heal (agent status/next/mark-done).
---

# layerkit-orchestrate-integration

Master loop: full-stack integration developer. Skills author knowledge and source edits; CLI gates/store.

**One pipeline** for first-time integrate and **contract heal**. Semantic work is agent-owned: the AI agent reads docs/OpenAPI/code, decides mappings from evidence, and edits production source files directly.

`discover → research → design → author → privacy → deletion-first → source-edit → verify → handoff`

Heal = human supplies updated OpenAPI/docs → AI agent reads and cites evidence → AI updates existing maps/source/tests in the package → deterministic CLI validates explicit artifacts and package health. The CLI does not understand arbitrary docs, semantic mappings, rename intent, or production source edits.

## Strategic Redirect Proof

Before any strategic redirect or large deletion/rewrite, add a small proof step and make it pass. Use the smallest useful proof: an eval, an end-to-end QA check, a contract-heal case, or a before/after acceptance test. Do not continue into broad deletion or rewrite work while the proof is missing or red.

## Primary commands

```bash
layerkit cheatsheet

layerkit agent start --mode full|heal [--vendor <v>] [--note <text>]
layerkit agent status
layerkit agent next
layerkit agent mark-done --step <id> --evidence <path>
layerkit proposal validate <file>   # read-only structural check
layerkit doctor
```

| Command | Purpose |
|---------|---------|
| `agent start --mode heal` | Initialize contract-update state; skips discover only |
| `agent status` / `next` / `mark-done` | Same step ids always |
| `proposal validate` / `map validate` / `doctor` | Validate explicit artifacts and package health; no semantic inference |

Step ids: `discover` | `research` | `design` | `author` | `privacy` | `deletion-first` | `source-edit` | `handoff`.

## Ordered pipeline

| id | Skill | Contract heal focus |
|----|-------|---------------------|
| `discover` | `layerkit-discover-data-layer` | **Skipped** when `mode: heal` |
| `research` | `layerkit-research-vendor` | Read docs/OpenAPI → evidence-backed map/source update |
| `design` | `layerkit-design-flow` | Re-validate shape under new contract |
| `author` | `layerkit-author-processor` | Only processors affected by drift |
| `privacy` | `layerkit-privacy-review` | Human if new PII fields |
| `deletion-first` | `layerkit-deletion-first` | Remove stale docs/tests/shims before adding code |
| `source-edit` | `layerkit-source-edit-client` or direct agent edit | Agent edits existing source/tests |
| `handoff` | checker + review | Human; breaking severity never silent |

## Stop conditions

| Stage | Stop if |
|-------|---------|
| research | no contract/evidence → residual human; do not invent |
| research docs | docs are prose-heavy/ambiguous → AI curates structured contract with citations; CLI-only heal is insufficient |
| research heal | removed/added fields look like a rename but evidence is weak → leave unresolved/TODO, do not guess |
| research heal | severity=breaking → flag human/checker before handoff |
| privacy | new PII without policy |
| verify | package build/test fails → fix-from-dry-run loop, then human if evidence exhausted |
| source-edit | client package verification fails |
| strategic redirect | no passing proof step for the redirect |
| handoff | any gate red |

## When to ask a human

- Residual gaps after deepen
- Breaking drift / legal / privacy
- Checker approval and release decision
- Live credentials

## Forbidden

- Parallel “heal product” checklist separate from this pipeline
- Inventing map fields without OpenAPI/docs
- Self-approve in STRICT
- Treating Layerkit as the runtime integration SDK
- Treating generated plans, stubs, or `.layerkit/out` as production source

## Success criteria

- [ ] `mode: heal` or `full` recorded in pipeline-status
- [ ] Evidence note when updating existing map/source
- [ ] Applied maps/proposals have sources[] from supplied docs/OpenAPI/code
- [ ] Production source/test edits were made by the agent in real package files
- [ ] Package tests/build/coverage command green before handoff
