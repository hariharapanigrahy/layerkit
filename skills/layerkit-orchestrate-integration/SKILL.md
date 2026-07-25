---
name: layerkit-orchestrate-integration
description: Master skill — ordered agent-as-developer pipeline via agent status/next/mark-done, stop conditions, when to ask human.
---

# layerkit-orchestrate-integration

Master loop: behave like a **full-stack integration developer**. Skills author knowledge; CLI gates/store; runtime has **no LLM on track()**.

**Source of truth for next step + CLI hints:** `libs/agent/pipeline.ts` (`INTEGRATION_PIPELINE`). Drive progress with the agent CLI below — do not invent a parallel checklist.

## Primary commands (always start here)

```bash
# Full checkbox pipeline + memory markers under memory/runbooks/pipeline-status.md
layerkit agent status

# Next incomplete step: skill name + exact CLI commands from INTEGRATION_PIPELINE
layerkit agent next

# After a step's doneWhen is satisfied, persist the marker (auto-suggests next)
layerkit agent mark-done --step <id>
```

| Command | Purpose |
|---------|---------|
| `layerkit agent status` | Ordered steps, which are done, next highlight |
| `layerkit agent next` | Print **skill** + **cliHints** for the next incomplete step |
| `layerkit agent mark-done --step <id>` | Append `- [x] <id>` to `memory/runbooks/pipeline-status.md` |

**Loop:** `agent next` → run skill + CLI hints → when done, `agent mark-done --step <id>` → `agent next` again. Doctor also prints one line: `Next agent step: …` when a project exists.

Step ids: `discover` | `research` | `design` | `author` | `privacy` | `generate` | `handoff`.

Markers alone are enough for orchestration progress (no extra research note required on mark-done).

## Product rules

- Do **not** hardcode Meta/Google/TikTok field truth into core
- Customer-owned evidence only; residual human for true gaps

## Ordered pipeline (INTEGRATION_PIPELINE)

Canonical order: **discover → research → design → author → privacy → generate → handoff**.

| id | Skill | CLI hints (from pipeline) | Done when | Human? |
|----|-------|---------------------------|-----------|--------|
| `discover` | `layerkit-discover-data-layer` | `layerkit doctor`; `layerkit memory list --type research`; `layerkit memory append --type research --title "domain discovery" --body "..."` | Customer domain events/fields discovered from code; questionnaire Q3–Q4 seeded with sources | |
| `research` | `layerkit-research-vendor` | `layerkit map show <vendor>`; `layerkit map list`; `layerkit proposal validate ./proposal.json`; `layerkit proposal apply ./proposal.json` | vendor_map proposal validated and applied with sources[] (evidence-first) | |
| `design` | `layerkit-design-flow` | `layerkit proposal validate ./flow.json`; `layerkit process dry-run --vendor <v> --intent <i>` | IntegrationFlow when sequence/branching required; prefer flat VendorMap first | |
| `author` | `layerkit-author-processor` | `layerkit proposal validate ./proc.json`; `layerkit proposal apply ./proc.json` | Processors with citations; map field rows point at processorId | |
| `privacy` | `layerkit-privacy-review` | `layerkit doctor`; `layerkit memory list --type privacy` | PrivacyPolicy reviewed; consent/hash/redact with sources before live egress | yes |
| `generate` | `layerkit-generate-java` | `layerkit generate --lang java`; `cd <projectDir>/out/java && mvn test`; `layerkit doctor --quality --strict` | Java scaffold filled; JaCoCo line ≥ 0.95; quality gate green | |
| `handoff` | `handoff` (use `layerkit-checker-assist` + session handoff) | `layerkit promote --vendor <id>`; `layerkit agent status`; checker skill read-only | Maps promoted live; checker checklist complete; handoff to runtime owners | yes |

Supporting skills (not separate pipeline ids — use when the step needs them):

| Skill | When |
|-------|------|
| `layerkit-bootstrap` | Install / doctor hard-fail before discover |
| `layerkit-design-integration` | Shape unclear (multi-contract) during design |
| `layerkit-author-map` | Map field rows during research/author |
| `layerkit-align-client-style` | Optional client style alignment before generate |
| `layerkit-fix-from-dry-run` | Dry-run fail (loop ≤3) then human |
| `layerkit-checker-assist` | Read-only risk checklist at handoff (never self-approve) |
| `layerkit-session-handoff` | Anytime context limit / session end |

## Stop conditions

| Stage | Stop if |
|-------|---------|
| bootstrap | doctor hard-fail / install broken |
| discover | no code access; domain_spec blocked |
| research | evidence exhausted → residual human (do not invent) |
| design | multi-contract choice needs human |
| author | needs-evidence on critical fields; uncited hash/normalize |
| privacy | PII egress without policy → **stop before live** |
| dry-run | fail → fix-from-dry-run ≤3 then human |
| generate | coverage &lt; 95% / `doctor --quality --strict` fail |
| promote/live | any gate red (quality, privacy, checker) |

## When to ask a human

- Residual Q dimensions after deepen L0–L4
- Legal basis / consent purposes not in customer docs
- Checker/privacy_reviewer approval (never self-approve as maker)
- Production host credentials and live probe consent
- Ambiguous multi-vendor routing product decisions
- Steps flagged `requiresHuman` in the pipeline (`privacy`, `handoff`)

## When **not** to ask

- Q1/Q2 answerable from OpenAPI/curl already in seeds
- Field names present in customer code (discover)
- Re-deriving answers already in `{projectDir}/memory/`
- Which step is next — always prefer `layerkit agent next`

## Supporting CLI anchors

Prefer `agent next` for the exact per-step command list. Broader surface:

```bash
layerkit doctor
layerkit doctor --quality --strict
layerkit memory index
layerkit proposal validate <file>
layerkit proposal submit <file> --by <agentId>
# human: proposal approve --by <humanId> --role checker
layerkit process dry-run --vendor <v> --intent <i>
layerkit generate --lang java
layerkit promote --vendor <id>
```

## Forbidden

- Catalog filling / inventing maps to look complete
- Skipping privacy before live PII egress
- Approving own proposals in strict maker-checker
- LLM on `track()` hot path
- Continuing after 3 failed fix-from-dry-run loops without human
- Skipping `agent mark-done` so the next agent cannot resume from markers

## Success criteria

- [ ] Pipeline stage recorded via `layerkit agent mark-done` (memory markers)
- [ ] `layerkit agent status` shows completed steps; next is correct
- [ ] All applied artifacts have sources[]
- [ ] Dry-run green for primary intents before promote
- [ ] Handoff runbook if session ends mid-pipeline
