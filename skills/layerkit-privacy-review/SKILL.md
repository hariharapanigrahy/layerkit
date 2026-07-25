---
name: layerkit-privacy-review
description: Strengthen PrivacyPolicy + egress checks before live; consent/hash/redact with sources; fail-closed live.
---

# layerkit-privacy-review

Privacy gate runs **before live egress**. Author/review policy and record a review digest — not production traffic.

## Protocol

1. Inventory PII from maps/flows: email, phone, external ids, address, consent fields.
2. List purposes and regions in scope (from customer policy or residual human answers — never invent legal basis).
3. Draft or review `PrivacyPolicy` (schemaVersion 2):

```text
defaultAction: allow | deny | redact | hash
rules[]: when → action (hash|redact|drop|allow) + sources
egressChecks[]: consent required? denylist? region?
```

4. Every non-trivial rule needs `sources[]` (or cite processor docs). Prefer `hash`/`redact` over raw allow.
5. Modes:
   - **Live**: missing consent / denylist hit → drop or **fail closed** (`privacy-live-require` gate)
   - **Dry-run**: may warn without hard-fail; still record warnings in memory
6. Set `requiresPrivacyReview: true` on v2 proposals when hashing/consent/PII transforms change.
7. Propose `privacy_policy` kind proposal; validate:

```bash
layerkit proposal validate ./privacy-policy.json
layerkit memory append --type privacy --title "privacy review <vendor>" --vendor <vendor> --body-file ./privacy-digest.md
```

8. Digest must include: fields in scope, rules applied, residual risks, checker questions — **no raw emails/phones**.

## Forbidden

- Approving live egress without consent/purpose rules when policy requires them
- Double-hashing already-hashed fields without evidence
- Inventing hash algorithms or legal bases without cited vendor/customer rule
- Pasting real PII into memory or proposals
- Self-approving as privacy_reviewer when you are the maker (strict mode)

## Success criteria

- [ ] All PII field rows covered by rule or explicit accept-risk note
- [ ] Live fail-closed behavior documented and tested (dry-run warns)
- [ ] Sources on non-trivial rules
- [ ] Redacted privacy digest in `{projectDir}/memory/privacy/`
