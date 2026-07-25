---
name: layerkit-design-integration
description: Choose linear map vs flow (route/foreach/if), multi-step, batch; write design decision to memory.
---

# layerkit-design-integration

Decide **how** to integrate after research: flat map vs multi-step flow. Record the design before authoring.

## Decision tree

| Situation | Choose |
|-----------|--------|
| Single endpoint, one payload per event, no branching | **Linear `VendorMap`** |
| OAuth/token then POST, multi-call sequence | **Flow** (`call` + `assign` + `responseInto`) |
| Cart line fan-out / batch chunks | **Flow** (`foreach` + optional `batch_chunks`) |
| Intent-specific routes or predicates | **Flow** (`route` / `if`) |
| Simple intents + multi-step intents for same vendor | **Hybrid** |
| PII before egress | Map or flow + **privacy node** / policy |

Default: **prefer flat map**. Introduce flow only when sequence, branching, or multi-call is required by evidence.

## Protocol

1. Read research memory + domain_spec for the vendor.
2. List required operations (from OpenAPI/curl) and which intents they serve.
3. Choose shape: `linear_map` | `flow` | `hybrid` (map for simple intents, flow for multi-step).
4. Emit a design decision artifact (preferred CLI):

```bash
# compute shape from signals (sequence/branch/foreach/oauth/multi-call)
layerkit design decide --vendor <vendor> \
  [--sequence] [--branch] [--foreach] [--oauth] [--multi-call] \
  [--intent purchase]... [--evidence https://docs.example/...]... \
  [--shape linear_map|flow|hybrid] [--out memory|path] [--json]
```

Writes `{projectDir}/memory/runbooks/design-<vendor>.md` (and optional companion JSON with `--json`).

5. Sketch design (ids only — no invented field names):

```text
shape: linear_map | flow | hybrid
vendor: <id>
intents: [...]
operations: [operationId → method path]
batch: none | foreach products[] | batch_chunks N
auth_steps: none | token_then_post
privacy: pre-egress policy required? yes/no
evidence: [urls / file://]
open_questions: [...]
```

6. Also keep a short proposals note if useful:

```bash
layerkit memory append --type proposals --title "<vendor> integration design" --vendor <vendor> --body-file ./design.md
```

7. Next:
   - linear → `layerkit-author-map` (+ processors as needed)
   - flow → `layerkit-design-flow` after map/processors for field rows
   - hybrid → author map for simple intents; flow for multi-step
   - always → `layerkit-privacy-review` when PII/consent applies

## Forbidden

- Designing multi-step auth without cited OpenAPI/curl evidence
- Preferring flow when a flat map satisfies the contract
- Inventing endpoints or batch semantics
- Finalizing / promoting from this skill

## Success criteria

- [ ] Explicit shape decision with evidence pointers
- [ ] Open questions listed (none silently assumed)
- [ ] Design runbook at `{projectDir}/memory/runbooks/design-<vendor>.md`
- [ ] Matches later author-map / design-flow artifacts
