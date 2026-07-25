# Design addendum: agent-as-developer (no vendor catalog)

| Field | Value |
|-------|--------|
| **Status** | Active |
| **Date** | 2026-07-26 |
| **Supersedes** | Vendor catalog / VENDOR_SLOTS product direction |

## Decision

Layerkit **does not** maintain a vendor integration catalog (no 20–1000 prebuilt maps, no catalog contribution as primary OSS path).

**Product = skills + evals + deterministic runtime primitives** so an AI agent can integrate **any** vendor like a developer, for a **customer-owned** project store.

## Why

- Catalog maps and deterministic “official” field tables **go stale**.
- We are not building 1000 connectors; we build the **agent process**.
- Customer maps live under `{projectDir}` only.

## Keep (deterministic, non-vendor-specific)

- Proposal validate/apply, maker-checker  
- Strategy **registry + builtins** (generic transforms)  
- Flow engine, privacy gate, track, delivery simulator  
- Process evals (evidence-first, no-invent, citation, etc.)  
- Sample **domain** shape (`COMMERCE_DOMAIN`) as a template, not a vendor list  

## Remove / avoid

- `VENDOR_SLOTS` multi-vendor catalog  
- POC seeding N empty vendor maps  
- Marketing or CONTRIBUTING that asks to “fill the catalog”  
- Package-shipped maps for Meta/Google/… as product truth  

## Eval fixtures

`evals/fixtures/agent/*` and synthetic `example_vendor` are **test scenarios only**, not a catalog.

## Agent loop (skills)

discover → research (evidence-first) → design → author map/processor/flow → privacy → generate client → dry-run fix → checker-assist → handoff memory.
