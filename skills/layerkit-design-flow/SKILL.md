---
name: layerkit-design-flow
description: Author IntegrationFlow AST (route/map/foreach/if/call); finalize only after quality gates pass.
---

# layerkit-design-flow

Design multi-step vendor **flows** when a flat map is insufficient (OAuth-then-POST, cart foreach, privacy node).

## Protocol

1. Prefer flat `VendorMap` first (`layerkit-design-integration`); use flow only for sequence/branching.
2. Author `IntegrationFlow` (schemaVersion 2): structured `ConditionExpr` only — **no CEL**.
3. Node types: `route | map_fields | foreach | if | assign | call | privacy | fanout_branches | end`.
4. Respect `FLOW_LIMITS`: maxNodes 50, maxForeachItems 500, maxWorkingMemoryBytes 1MiB, maxCallDepth 8.
5. Wire `privacy` node before egress when PII or consent applies.
6. Proposal kind `flow` with `sources[]` citing multi-step docs/collections/curl sequences.
7. Validate + dry-run before live:

```bash
layerkit proposal validate ./flow-proposal.json
layerkit process dry-run --vendor <v> --intent <i>
layerkit memory append --type proposals --title "<vendor> flow design" --vendor <v> --body-file ./flow-note.md
```

8. **Do not finalize / promote to `live` until quality gates pass:**
   - ≥95% line coverage on integration modules (aim 100% pure processors/privacy/flow)
   - SonarQube 0 Blocker/Critical; Majors fixed or justified in memory
   - Maker-checker + privacy review when required
   - Evidence-first Q1–Q10 complete (residual human gaps only)
   - Dry-run / shadow succeeds for primary intents

```bash
layerkit doctor --quality --strict
# promote only after gates + human checker
```

9. Memory note under `{projectDir}/memory/` for finalize decision.

## Forbidden

- Promoting while coverage/Sonar/doctor quality fail
- LLM on the runtime hot path
- Inventing auth/endpoint steps without cited evidence
- Freeform/CEL expressions
- Finalizing before privacy review when PII egress exists

## Success criteria

- [ ] Flow within FLOW_LIMITS; entry + end nodes wired
- [ ] Every `call.operationId` backed by OpenAPI/curl evidence
- [ ] Dry-run success for happy path + one skip/abort path
- [ ] Finalize checklist recorded in memory only after gates green
