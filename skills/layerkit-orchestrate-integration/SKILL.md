---
name: layerkit-orchestrate-integration
description: Master skill — same pipeline for first integrate and contract heal (agent status/next/mark-done).
---

# layerkit-orchestrate-integration

Master loop: full-stack integration developer. Skills author knowledge and source edits; CLI gates/store.

**One pipeline** for first-time integrate and **contract heal**. Semantic work is agent-owned: the AI agent reads docs/OpenAPI/code, decides mappings from evidence, and edits production source files directly.

`discover → surfaces → research → design → author → privacy → deletion-first → source-edit → verify → handoff`

Heal = human supplies updated OpenAPI/docs → AI agent reads and cites evidence → AI updates existing maps/source/tests in the package → deterministic CLI validates explicit artifacts and package health. The CLI does not understand arbitrary docs, semantic mappings, rename intent, or production source edits.

## Strategic Redirect Proof

Before any strategic redirect or large deletion/rewrite, add a small proof step and make it pass. Use the smallest useful proof: an eval, an end-to-end QA check, a contract-heal case, or a before/after acceptance test. Do not continue into broad deletion or rewrite work while the proof is missing or red.

## Outcome Checkpoints

Every implementation plan must include explicit outcome checkpoints before source edits start:

- what must pass
- the proof artifact that shows it passed
- the fallback or alternative approach if the design does not validate

Major redirects need proof before implementation, not after. Acceptable proof can be a passing judge, package-level fixture, release checklist item, or concrete before/after behavior. If the proof fails, shrink the change, update existing paths instead, or pause for residual human input.

## Primary commands

```bash
layerkit cheatsheet

layerkit agent start [--mode full|heal] [--vendor <v>] [--note <text>]   # default full
layerkit agent status
layerkit agent next
layerkit agent next                 # writes memory/runbooks/current-skill-packet.md
layerkit agent mark-done --step <id> --evidence <path>
layerkit proposal validate <file>   # read-only structural check
layerkit doctor
```

**Intentional purpose only:** User opts in with `layerkit: …` (or `/layerkit` / `@layerkit`) or an explicit integrate/heal-via-Layerkit request. Run `layerkit help` then `agent start`. Unrelated coding is out of scope — do not force these rails.

**Fail-closed (while claiming Layerkit):** freestyle without `agent start` is blocked at `next`/`mark-done`. Evidence must be non-empty and match the step content pattern. Prefer `agent next` so the skill packet lists the only allowed skill for this step.

**Pin-only is not full integrate:** Do not bump `apiVersion` or the vendor SDK alone and call it full integrate or contract heal. Pin-only / apiVersion alone is residual at best; production field renames and real source edits (or explicit residual-no-field-edit) are required when the contract drifted.

| Command | Purpose |
|---------|---------|
| `agent start` | Default **full** (includes discover). `--mode heal` skips discover when domain already known |
| `agent status` / `next` / `mark-done` | Same step ids always |
| `proposal validate` / `map validate` / `doctor` | Validate explicit artifacts and package health; no semantic inference |

Step ids: `discover` | `surfaces` | `research` | `design` | `author` | `privacy` | `deletion-first` | `source-edit` | `handoff`.

## Ordered pipeline

| id | Skill | Contract heal focus |
|----|-------|---------------------|
| `discover` | `layerkit-discover-data-layer` | **Skipped** when `mode: heal` |
| `surfaces` | `layerkit-inventory-surfaces` | **Always runs** — inventory package languages; Layerkit blocks PR until each is updated\|residual |
| `research` | `layerkit-research-vendor` | Read docs/OpenAPI → evidence-backed map/source update |
| `design` | `layerkit-design-flow` | Re-validate shape under new contract |
| `author` | `layerkit-author-map` (processors via `layerkit-author-processor` when needed) | Map fields from evidence; processors only if transforms required |
| `privacy` | `layerkit-privacy-review` | Human if new PII fields |
| `deletion-first` | `layerkit-deletion-first` | Remove stale docs/tests/shims before adding code |
| `source-edit` | `layerkit-source-edit-client` or direct agent edit | Agent edits existing source/tests |
| `handoff` | checker + review | **Terminal:** `package_verify: green` + **live** PR via `layerkit pr open --pr-match "…"` (reuse open workstream PR; collaborator push, else **fork→push→PR**) or residual-no-pr break-glass (`outcome: residual-no-pr` + `allow_residual_no_pr: true` + `residual: <why>`). `--pr-match` is a PR dedupe string only — not a vendor API registry. Fake PR URLs blocked. |

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
| plan | missing must-pass checkpoint, proof artifact, or fallback |

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
- Bumping apiVersion or SDK alone (pin-only) and calling it full integrate

## Success criteria

- [ ] `mode: heal` or `full` recorded in pipeline-status
- [ ] Evidence note when updating existing map/source
- [ ] Applied maps/proposals have sources[] from supplied docs/OpenAPI/code
- [ ] Production source/test edits were made by the agent in real package files
- [ ] Package tests/build/coverage command green before handoff
- [ ] Client PR opened (or residual-no-pr break-glass only when research proved zero production change: `allow_residual_no_pr: true` + residual reason)
- [ ] Outcome checkpoints recorded: must pass, proof artifact, fallback
- [ ] Test backing is proportional to implementation size, including client-package edit paths, mapping semantics, deletion-first behavior, and CI/eval gates when those areas change
