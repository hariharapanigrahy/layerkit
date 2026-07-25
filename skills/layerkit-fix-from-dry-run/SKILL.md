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
   - wrong endpoint path → use `fix suggest` + doc excerpt (below)
3. Re-open cited docs/OpenAPI/curl for the failing dimension; deepen if needed.
4. Emit a **revised proposal** (new id or `changeLog` + `baseArtifactVersion`) with sources covering the fix.
5. Validate and re-run dry-run:

```bash
layerkit proposal validate ./fix.json
layerkit process dry-run --vendor <v> --intent <i>
```

6. If still failing after evidence exhaustion → residual human question; stop inventing.
7. Next: re-enter maker-checker; if Java already generated → update adapters/tests.

## Deterministic fix CLI (`libs/agent/fix-loop`)

Use these when you already have a map JSON and either patches from evidence or a doc excerpt for path correction. Pure local apply — no network, no invent.

### Suggest a path patch from docs

Extracts a path from the doc (`POST /v1/events`, `path: /...`). If the map endpoint differs, prints a `MapPathFixPatch`. **No invent** when the doc has no extractable path.

```bash
layerkit fix suggest --map ./map.json --doc ./vendor-doc.md [--json]
```

Write the suggested patch into a patches file (or combine with other field fixes from evidence):

```json
[
  {
    "field": "endpoint.path",
    "from": "/v1/wrong/ingest",
    "to": "/v1/events",
    "reason": "Doc specifies POST /v1/events",
    "evidenceExcerpt": "Correct path: /v1/events"
  }
]
```

### Apply ordered patches + optional wire checks

```bash
layerkit fix dry-run \
  --map ./map.json \
  --patches ./patches.json \
  --expect-event Purchase \
  --require-field event_id \
  --forbid-field evt_id \
  --out ./map-fixed.json \
  [--json]
```

- Loads map + patches (`MapPathFixPatch[]`: `field`, `from?`, `to`, `reason?`, `evidenceExcerpt?`)
- Runs sequential `runSequentialMapFixes` / same result as `applyMapPatches`
- When `--expect-event` / `--require-field` / `--forbid-field` are set, evaluates pure dry-run wire **before** and after each step (`evaluateDryRunWire`)
- Writes fixed map when `--out` is set
- Exit code 1 if expectations are set and the **final** wire check fails

Then validate/submit the fixed map as a proposal and re-run:

```bash
layerkit process dry-run --vendor <v> --intent <i>
```

## Forbidden

- Inventing field names or defaults to silence dry-run
- Applying fixes without new/confirmed sources
- Using `fix suggest` to invent a path when the doc has none
- Skipping privacy when the failure was a privacy drop
- Live promote while dry-run fails

## Success criteria

- [ ] Root cause linked to evidence (or explicit residual gap)
- [ ] Revised proposal validates
- [ ] Dry-run passes for the failing intent (or documented skip with reason)
- [ ] Memory dry-runs note updated
