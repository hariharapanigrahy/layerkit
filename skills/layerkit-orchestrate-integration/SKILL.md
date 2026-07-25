---
name: layerkit-orchestrate-integration
description: Master skill — ordered agent-as-developer pipeline, stop conditions, when to ask human.
---

# layerkit-orchestrate-integration

Master loop: behave like a **full-stack integration developer**. Skills author knowledge; CLI gates/store; runtime has **no LLM on track()**.

## Product rules

- Do **not** hardcode Meta/Google/TikTok field truth into core
- Customer-owned evidence only; residual human for true gaps

## Ordered pipeline

| # | Skill | Stop if |
|---|-------|---------|
| 0 | `layerkit-bootstrap` | doctor hard-fail / install broken |
| 1 | `layerkit-discover-data-layer` | no code access; domain_spec blocked |
| 2 | `layerkit-research-vendor` | evidence exhausted → residual human (do not invent) |
| 3 | `layerkit-design-integration` | shape unclear without human (multi-contract choice) |
| 4a | `layerkit-author-map` | needs-evidence on critical fields |
| 4b | `layerkit-author-processor` | uncited hash/normalize rules |
| 4c | `layerkit-design-flow` | only if design said flow; else skip |
| 5 | `layerkit-privacy-review` | PII egress without policy → **stop before live** |
| 6 | `layerkit-align-client-style` | optional if no existing client |
| 7 | validate → submit → **human checker** (`layerkit-checker-assist` is read-only) | checker rejects |
| 8 | `layerkit process dry-run` | fail → `layerkit-fix-from-dry-run` (loop ≤3) then human |
| 9 | `layerkit-generate-java` + tests | coverage &lt; 95% / doctor --quality --strict fail |
| 10 | promote/live only after quality + privacy + checker | any gate red |
| H | `layerkit-session-handoff` | anytime context limit / session end |

## When to ask a human

- Residual Q dimensions after deepen L0–L4
- Legal basis / consent purposes not in customer docs
- Checker/privacy_reviewer approval (never self-approve as maker)
- Production host credentials and live probe consent
- Ambiguous multi-vendor routing product decisions

## When **not** to ask

- Q1/Q2 answerable from OpenAPI/curl already in seeds
- Field names present in customer code (discover)
- Re-deriving answers already in `{projectDir}/memory/`

## CLI anchors

```bash
layerkit doctor
layerkit memory index
layerkit proposal validate <file>
layerkit proposal submit <file> --by <agentId>
# human: proposal approve --by <humanId> --role checker
layerkit process dry-run --vendor <v> --intent <i>
layerkit generate --lang java
layerkit doctor --quality --strict
```

## Forbidden

- Catalog filling / inventing maps to look complete
- Skipping privacy before live PII egress
- Approving own proposals in strict maker-checker
- LLM on `track()` hot path
- Continuing after 3 failed fix-from-dry-run loops without human

## Success criteria

- [ ] Pipeline stage recorded in memory (which # done)
- [ ] All applied artifacts have sources[]
- [ ] Dry-run green for primary intents before promote
- [ ] Handoff runbook if session ends mid-pipeline
