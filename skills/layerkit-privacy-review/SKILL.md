---
name: layerkit-privacy-review
description: Review and update client-owned privacy, consent, hashing, redaction, and egress checks before vendor integration changes ship.
---

# layerkit-privacy-review

Privacy review is source-code review plus evidence capture. Layerkit does not provide a runtime privacy gate for the client package.

## Protocol

1. Inventory new or changed fields from the vendor contract and client mapper.
2. Classify likely PII/regulated data from field meaning, customer code, and policy evidence.
3. Inspect existing consent, hashing, redaction, allowlist, denylist, and region checks in the client package.
4. Update existing privacy code/tests directly when the vendor change requires it.
5. Move raw API keys, passwords, private keys, bearer tokens, and credentials to environment variables or the client's secrets manager. Do not paste them into Layerkit memory/proposals/tests.
6. Leave a TODO only when customer policy or datalayer support is missing.
7. Record a redacted memory note:

```bash
layerkit memory append --type privacy --title "privacy review <vendor>" --vendor <vendor> --body-file ./privacy-digest.md
```

8. Run the client package tests that cover privacy behavior and `layerkit doctor`.

## Forbidden

- Inventing legal basis, consent meaning, or privacy classification.
- Pasting real PII into Layerkit memory, proposals, tests, or docs.
- Leaving API keys, passwords, or tokens as source string literals.
- Adding a parallel privacy layer when the existing client privacy path can be changed.
- Treating a Layerkit proposal as production privacy enforcement.
- Self-approving a privacy-sensitive change in strict maker-checker mode.

## Success Criteria

- [ ] Changed PII fields are covered by existing or updated client checks.
- [ ] Privacy tests were updated when behavior changed.
- [ ] Secret-like values are env/SecretRef/secrets-manager references, not literals.
- [ ] Digest names residual human questions without raw PII.
- [ ] Unsupported data/policy gaps are explicit TODOs in the integration path.
