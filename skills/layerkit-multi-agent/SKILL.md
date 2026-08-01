---
name: layerkit-multi-agent
description: Fan-out multi-agent plan for integrate or contract heal; spawn specialists; brownfield production code.
---

# layerkit-multi-agent

Team of agents on the **same** integration pipeline. CLI builds a deterministic plan; lead spawns specialists.

## Start

### Contract heal (map already exists — human supplies OpenAPI)

```bash
layerkit research fill --vendor resend --openapi ./contract-v2.json
layerkit agent multi --vendor resend --mode heal --openapi ./contract-v2.json [--module-root <dir>]
```

- Discover task **omitted**
- Researcher = pin + drift + map-from-openapi
- Integrator patches production for drift only

### First-time / multi-vendor

```bash
layerkit agent multi --vendor resend --vendor postmark [--module-root <dir>] [--max-parallel 4]
```

Artifacts:

- `{projectDir}/memory/runbooks/multi-agent-plan.md`
- `{projectDir}/out/multi-agent-plan.json`

## Roles

| Role | Skill | Heal note |
|------|-------|-----------|
| orchestrator | orchestrate-integration | status shows mode=heal\|full |
| discoverer | discover-data-layer | **not in heal plan** |
| stylist | align-client-style | topology for existing adapters |
| researcher | research-vendor | contract pin + drift |
| designer / author | design / processor | surgical on drift |
| privacy | privacy-review | human if new PII |
| integrator | generate-java | production patches |
| verifier | fix-from-dry-run + doctor | dry-run + quality |
| checker | checker-assist | read-only |

## Concurrency

- Parallel research/integrate per vendor  
- Single writer: `integrator:registry`  
- Human: privacy, promote, breaking drift  

## Forbidden

- Two agents on the same registry file  
- Re-running full discover on heal when domain is known  
- Invented fields; self-approve  

## Success

- [ ] Plan mode matches intent (heal vs full)  
- [ ] Specialists spawned from plan prompts  
- [ ] Production adapters updated  
- [ ] Dry-run + quality green  
- [ ] Human promote after checker  
