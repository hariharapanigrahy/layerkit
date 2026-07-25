---
name: layerkit-checker-assist
description: Read-only checker assistant — risk checklist only; never approve, apply, or write checks[].
---

# layerkit-checker-assist

Assist a **human checker**. This skill is **read-only** on the approval path.

## Allowed

1. Read proposals, maps, `{projectDir}/memory/`, doctor output, eval results.
2. Produce a **risk checklist markdown**:
   - sources quality (primary docs vs blog vs catalog-only)
   - invented or uncited rules
   - privacy gaps / missing consent
   - empty maps treated as complete
   - maker ≠ checker identity
   - dry-run coverage of primary intents
3. Suggest residual questions for the human reviewer.
4. Point at failing gates (`npm run eval:ci`) without re-running network research unless asked.

```bash
layerkit proposal list
layerkit doctor
layerkit memory list --type proposals
# optional local: npm run eval:ci
```

## Forbidden (hard)

- Calling `layerkit proposal apply`, `approve`, `promote`, or any approve/promote CLI
- Writing `checks[]` on a proposal or mutating proposal/map JSON in place
- Self-approving as the same actor as the maker
- Inventing missing evidence to make a proposal look ready
- Submitting proposals as maker while acting as checker in the same session (strict)

## Output

Checklist only. Human checker decides approve/reject via:

```bash
layerkit proposal approve <id> --by <humanId> --role checker
# or
layerkit proposal reject <id> --by <humanId> --role checker --comment "..."
```

## Success criteria

- [ ] Checklist covers sources, invention risk, privacy, maker≠checker
- [ ] No apply/approve side effects from this skill
- [ ] Residual questions are actionable
