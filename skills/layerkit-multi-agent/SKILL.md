---
name: layerkit-multi-agent
description: Coordinate specialist agents for integrate or contract heal; brownfield production code.
---

# layerkit-multi-agent

Team of agents on the **same** integration pipeline. The lead agent coordinates specialists directly; Layerkit does not generate a deterministic multi-agent plan.

## Start

### Contract heal (map already exists — human supplies OpenAPI/docs)

- Discover task **omitted**
- Researcher = evidence-backed semantic rename decisions when needed
- If only docs are supplied, researcher/AI must read/cite docs before source edits
- AI agents edit production source/test files directly
- Record rename decisions in the handoff note only when docs/code evidence supports a removed-to-added field rename

### First-time / multi-vendor

Use the lead agent to assign vendors/files explicitly. Keep one writer per production file and use handoff notes for state.

## Roles

| Role | Skill | Heal note |
|------|-------|-----------|
| orchestrator | orchestrate-integration | status shows mode=heal\|full |
| discoverer | discover-data-layer | **not in heal plan** |
| stylist | align-client-style | topology for existing adapters |
| researcher | research-vendor | contract pin + drift |
| designer / author | design / processor | surgical on drift |
| privacy | privacy-review | human if new PII |
| integrator | generate-java | direct production source edits |
| verifier | doctor + project tests | quality |
| checker | checker-assist | read-only |

## Concurrency

- Parallel research/integrate per vendor when files do not overlap
- Single writer: `integrator:registry`
- Human: privacy, checker approval, breaking drift

## Forbidden

- Two agents on the same registry file
- Re-running full discover on heal when domain is known
- Invented fields or guessed renames; self-approve
- Treating generated plans as production source code
- Relying on Layerkit runtime/route/strategy code instead of editing the client package

## Success

- [ ] Agent assignments match intent (heal vs full)
- [ ] Specialists have explicit files/responsibilities
- [ ] Production adapters updated
- [ ] Project tests + quality green
- [ ] Human checker handoff complete
