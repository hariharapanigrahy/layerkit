---
name: layerkit-orchestrate-integration
description: Master skill — same pipeline for first integrate and contract heal (agent status/next/mark-done).
---

# layerkit-orchestrate-integration

Master loop: full-stack integration developer. Skills author knowledge and source edits; CLI gates/store; **no LLM on track()**.

**One pipeline** for first-time integrate and **contract heal** (Dependabot-for-APIs wedge), but contract heal uses `layerkit heal run` only for contract pinning, drift, and map proposal/application. The AI agent edits production source files directly after reading docs and code.

`discover → research → design → author → privacy → deletion-first → source-edit → verify → handoff`

Heal = human supplies updated OpenAPI/docs → AI-curated structured contract → `heal run` pins + diffs + updates map/proposal (discover skipped via `mode: heal`) → AI edits source/tests in the package. The CLI does not understand arbitrary docs or semantic mappings; the skill/agent reads, cites, curates contract/rename decisions, and performs source changes. `layerkit generate` is a separate optional planning/context command, not part of the heal path.

## Primary commands

```bash
layerkit cheatsheet

# Contract update (preferred when map already exists)
layerkit heal run --vendor <v> --openapi <contract.json> --module-root <dir> [--doc <url>]
layerkit heal run --vendor <v> --openapi <contract.json> --module-root <dir> --rename-decisions <json>
layerkit agent multi --vendor <v> --mode heal --openapi <contract.json> [--module-root <dir>]

# First-time / multi-vendor
layerkit agent multi --vendor <v> [--vendor <v2>] [--module-root <dir>]

layerkit agent status
layerkit agent next
layerkit agent mark-done --step <id>
```

| Command | Purpose |
|---------|---------|
| `heal run --vendor --openapi --module-root` | Pin contract, drift vs map, update map/proposal; source edit remains agent-owned |
| `heal run --rename-decisions <json>` | Carry explicit evidence-backed field renames into the map/proposal |
| `agent multi --mode heal` | Coordinate direct heal work without discover |
| `agent status` / `next` / `mark-done` | Same step ids always |

Step ids: `discover` | `research` | `design` | `author` | `privacy` | `generate` | `handoff`.

## Ordered pipeline

| id | Skill | Contract heal focus |
|----|-------|---------------------|
| `discover` | `layerkit-discover-data-layer` | **Skipped** when `mode: heal` |
| `research` | `layerkit-research-vendor` | Read docs/OpenAPI → curate structured contract → heal drift |
| `design` | `layerkit-design-flow` | Re-validate shape under new contract |
| `author` | `layerkit-author-processor` | Only processors affected by drift |
| `privacy` | `layerkit-privacy-review` | Human if new PII fields |
| `deletion-first` | `layerkit-deletion-first` | Remove stale docs/tests/shims before adding code |
| `source-edit` | `layerkit-generate-java` or direct agent edit | Agent edits existing source/tests; generate is optional context, not codegen |
| `handoff` | checker + promote | Human; breaking severity never silent |

## Stop conditions

| Stage | Stop if |
|-------|---------|
| research | no contract/evidence → residual human; do not invent |
| research docs | docs are prose-heavy/ambiguous → AI curates structured contract with citations; CLI-only heal is insufficient |
| research heal | removed/added fields look like a rename but evidence is weak → leave unresolved/TODO, do not guess |
| research heal | severity=breaking → flag human/checker before promote |
| privacy | new PII without policy |
| dry-run | fail → fix-from-dry-run ≤3 then human |
| generate | quality fail |
| promote | any gate red |

## When to ask a human

- Residual gaps after deepen
- Breaking drift / legal / privacy
- Checker approval and promote
- Live credentials

## Forbidden

- Parallel “heal product” checklist separate from this pipeline
- Inventing map fields without OpenAPI/docs
- Self-approve in STRICT
- LLM on `track()`
- Treating generated plans, stubs, or `.layerkit/out` as production source

## Success criteria

- [ ] `mode: heal` or `full` recorded in pipeline-status
- [ ] Drift artifact when updating existing map
- [ ] Applied maps/proposals have sources[] from supplied contract
- [ ] Production source/test edits were made by the agent in real package files
- [ ] Dry-run + quality green before promote
