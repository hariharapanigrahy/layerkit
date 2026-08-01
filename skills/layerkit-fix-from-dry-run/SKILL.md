---
name: layerkit-fix-from-dry-run
description: Fix failed integration verification from logs, tests, and docs evidence; edit real package files, no invention.
---

# layerkit-fix-from-dry-run

Use this skill when an integration change fails verification. The failure may come from a client test, build, typecheck, linter, mocked vendor call, or reviewer finding.

## Inputs

- Failing command output or reviewer finding
- Edited source files and tests
- Current maps/proposals if the client uses them
- Vendor docs/OpenAPI/curl evidence
- Customer datalayer/interface evidence

## Protocol

1. Reproduce or inspect the failure.
2. Identify the exact source path responsible.
3. Re-open the vendor/customer evidence for the failing dimension.
4. Prefer deleting or rewriting stale code over adding another wrapper.
5. Patch the real package file or test directly.
6. Validate explicit map/proposal artifacts only when they are part of the change:

```bash
layerkit proposal validate ./proposal.json
layerkit map validate ./map.json
```

7. Re-run the client package verification command.
8. If evidence is exhausted and the semantic answer is still unclear, stop with a residual human question.

## Common Fixes

- Vendor field renamed: update the existing mapping to write the new vendor field from the existing client field.
- Vendor field removed: delete the old mapping and assertions.
- Vendor added required data already present in the client datalayer: map it directly and add/adjust tests.
- Vendor added required data missing from the client datalayer: leave a TODO at the integration point and call it out in handoff.
- Shape changed from scalar to object: update the existing mapper and tests from the new schema, preserving client naming.

## Forbidden

- Inventing field names or defaults to silence a test.
- Adding a parallel adapter when the existing adapter can be changed.
- Writing `.layerkit/out` artifacts as a substitute for source edits.
- Asking a deterministic CLI command to infer a semantic fix from prose.
- Leaving old broken code in place and adding new code around it.

## Success Criteria

- [ ] Root cause tied to evidence or an explicit residual gap.
- [ ] Existing source/tests were updated or stale code was deleted.
- [ ] New files/functions/exports list what they replace.
- [ ] Client verification passes, or the remaining blocker is documented for a human.
