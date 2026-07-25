---
name: layerkit-design-flow
description: Author IntegrationFlow AST (route/map/privacy/call); finalize blocked until quality gates pass.
---

# layerkit-design-flow

Design multi-step vendor **flows** when a flat map is insufficient (OAuth-then-POST, cart foreach, privacy node).

## Protocol

1. Prefer flat `VendorMap` first; introduce flow only when sequence/branching is required.
2. Author `IntegrationFlow` (schemaVersion 2): structured `ConditionExpr` only — **no CEL**.
3. Respect `FLOW_LIMITS` (nodes, foreach size, working memory, call depth).
4. Wire privacy node before egress when PII or consent applies.
5. Validate via proposal pipeline; dry-run / shadow before live.
6. **Do not finalize / promote to `live` until quality gates pass:**
   - ≥95% line coverage on integration modules (aim 100% pure processors/privacy/flow)
   - SonarQube 0 Blocker/Critical; Majors fixed or justified in memory
   - Maker-checker + privacy review when required
   - Evidence-first Q1–Q10 complete (residual human gaps only)
7. Memory note under `{projectDir}/memory/` for finalize decision.

## Forbidden

- Promoting while coverage/Sonar fail
- LLM on the runtime hot path
- Inventing auth/endpoint steps without cited evidence
