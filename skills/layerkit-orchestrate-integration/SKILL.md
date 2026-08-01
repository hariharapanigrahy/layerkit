---
name: layerkit-orchestrate-integration
description: Master skill — same pipeline for first integrate and contract heal (agent status/next/mark-done).
---

# layerkit-orchestrate-integration

Master loop: full-stack integration developer. Skills author knowledge; CLI gates/store; **no LLM on track()**.

**One pipeline** for first-time integrate and **contract heal** (Dependabot-for-APIs wedge):

`discover → research → design → author → privacy → deletion-first → generate → handoff`

Heal = human supplies updated OpenAPI/docs → `research fill` pins + diffs → same steps (discover skipped via `mode: heal`).

## Primary commands

```bash
layerkit cheatsheet

# Contract update (preferred when map already exists)
layerkit research fill --vendor <v> --openapi <contract.json> [--doc <url>]
layerkit agent multi --vendor <v> --mode heal --openapi <contract.json> [--module-root <dir>]

# First-time / multi-vendor
layerkit agent multi --vendor <v> [--vendor <v2>] [--module-root <dir>]

layerkit agent status
layerkit agent next
layerkit agent mark-done --step <id>
```

| Command | Purpose |
|---------|---------|
| `research fill --vendor --openapi` | Pin contract, drift vs map, set mode heal/full |
| `agent multi --mode heal` | Fan-out plan without discover |
| `agent status` / `next` / `mark-done` | Same step ids always |

Step ids: `discover` | `research` | `design` | `author` | `privacy` | `generate` | `handoff`.

## Ordered pipeline

| id | Skill | Contract heal focus |
|----|-------|---------------------|
| `discover` | `layerkit-discover-data-layer` | **Skipped** when `mode: heal` |
| `research` | `layerkit-research-vendor` | Pin OpenAPI → drift → map-from-openapi |
| `design` | `layerkit-design-flow` | Re-validate shape under new contract |
| `author` | `layerkit-author-processor` | Only processors affected by drift |
| `privacy` | `layerkit-privacy-review` | Human if new PII fields |
| `deletion-first` | `layerkit-deletion-first` | Remove stale docs/tests/shims before adding code |
| `generate` | `layerkit-generate-java` | Patch production adapters (INTEGRATE.md) |
| `handoff` | checker + promote | Human; breaking severity never silent |

## Stop conditions

| Stage | Stop if |
|-------|---------|
| research | no contract/evidence → residual human; do not invent |
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
- Treating `.layerkit/out/java` as production when integrate applies  

## Success criteria

- [ ] `mode: heal` or `full` recorded in pipeline-status  
- [ ] Drift artifact when updating existing map  
- [ ] Applied maps have sources[] from supplied contract  
- [ ] Dry-run + quality green before promote  
