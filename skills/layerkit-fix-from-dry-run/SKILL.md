---
name: layerkit-fix-from-dry-run
description: Given dry-run failure + docs evidence, revise map/flow/processor proposal; no invention.
---

# layerkit-fix-from-dry-run

Close the loop when dry-run or shadow fails: diagnose from logs + **re-check docs**, then revise proposals.

## Inputs

- Dry-run output (`layerkit process dry-run ...` JSON/stderr)
- Current map/flow/processor proposals
- Research memory + original sources
- Optional: failing test / JaCoCo gaps

## Protocol

1. Capture failure:

```bash
layerkit process dry-run --vendor <v> --intent <i> 2>&1 | tee ./dry-run-fail.log
layerkit memory append --type dry-runs --title "dry-run fail <v>/<i>" --vendor <v> --body-file ./dry-run-fail.log
```

2. Classify error (examples):
   - missing/optional field → map row or `optional: true` with evidence
   - processor unresolved → author or fix `processorId` (citation required)
   - privacy drop → consent path or policy rule (privacy-review)
   - empty map skip → research not applied yet
   - shape mismatch → re-read OpenAPI/curl; do **not** guess wire names
3. Re-open cited docs/OpenAPI/curl for the failing dimension; deepen if needed.
4. Emit a **revised proposal** (new id or `changeLog` + `baseArtifactVersion`) with sources covering the fix.
5. Validate and re-run dry-run:

```bash
layerkit proposal validate ./fix.json
layerkit process dry-run --vendor <v> --intent <i>
```

6. If still failing after evidence exhaustion → residual human question; stop inventing.
7. Next: re-enter maker-checker; if Java already generated → update adapters/tests.

## Forbidden

- Inventing field names or defaults to silence dry-run
- Applying fixes without new/confirmed sources
- Skipping privacy when the failure was a privacy drop
- Live promote while dry-run fails

## Success criteria

- [ ] Root cause linked to evidence (or explicit residual gap)
- [ ] Revised proposal validates
- [ ] Dry-run passes for the failing intent (or documented skip with reason)
- [ ] Memory dry-runs note updated
