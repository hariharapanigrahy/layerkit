---
name: layerkit-privacy-review
description: Review PrivacyPolicy + egress checks before live; require consent/hash/redact rules with sources.
---

# layerkit-privacy-review

Privacy gate runs **before live egress**. This skill authors/reviews policy, not production traffic.

## Protocol

1. Read map/flow fields that carry email/phone/PII; list purposes and regions in scope.
2. Draft or review `PrivacyPolicy` (schemaVersion 2): `defaultAction`, `rules[]`, `egressChecks[]`.
3. Every non-trivial rule needs `sources[]` (or cite processor docs). Prefer `hash`/`redact` over raw allow.
4. Live mode: missing consent / denylist hit → drop or fail closed (see `privacy-live-require` gate).
5. Dry-run may warn without hard-fail; still record warnings in memory.
6. Propose `requiresPrivacyReview` on v2 proposals when hashing/consent changes.
7. Append privacy review digest to `{projectDir}/memory/` (no raw emails/phones).

## Forbidden

- Approving live egress without consent/purpose rules when policy requires them
- Double-hashing already-hashed fields without evidence
- Inventing hash algorithms without a cited vendor/customer rule
