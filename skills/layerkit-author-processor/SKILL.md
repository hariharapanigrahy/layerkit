---
name: layerkit-author-processor
description: Author email/phone/time processors from vendor docs with mandatory citations; pure functions only.
---

# layerkit-author-processor

Processors are agent-authored **pure transforms**. Proposal `sources[]` is mandatory on both the proposal and the processor payload.

## Protocol

1. Identify transform need from map field rows (`transform.processorId`) and vendor docs (hash, normalize, E.164, epoch ms, etc.).
2. **Scaffold with CLI** (preferred) — dual sources (proposal + payload) and optional builtin op:

```bash
layerkit proposal write processor \
  --id example.email.sha256_normalized \
  --out ./proc.json \
  --source "PII hashing=https://docs.example.com/api/pii|Hash email with SHA256 after normalizing" \
  --description "Normalize email then SHA-256 hex" \
  --builtin-op hash.sha256_hex \
  --agent <agentId> \
  --validate
```

- `--source title=url` is **required** (repeatable). Optional `|excerpt` after the URL.
- `--builtin-op` wires an executable `{ type: "builtin", op }` implementation when a BuiltinOp matches.
- Does **not** auto-submit. Next tip: `layerkit proposal validate <file>`.

3. Or draft `processor` proposal by hand:

```json
{
  "schemaVersion": 2,
  "kind": "processor",
  "id": "proc-<id>-v1",
  "processorId": "<id>",
  "summary": "<what it does>",
  "authoredBy": "agent",
  "status": "draft",
  "createdAt": "<ISO>",
  "sources": [
    { "title": "Vendor hashing docs", "url": "https://...", "excerpt": "..." }
  ],
  "payload": {
    "id": "<id>",
    "kind": "agent",
    "description": "...",
    "category": "email|phone|timestamp|pii_hash|normalize|custom",
    "sources": [
      { "title": "...", "url": "https://...", "excerpt": "..." }
    ],
    "implementationHint": "lowercase + trim + sha256 hex",
    "piiAffecting": true,
    "inputTypes": ["string"],
    "outputType": "string"
  },
  "maker": { "type": "agent", "id": "<agent>" },
  "requiresPrivacyReview": true
}
```

4. Validate + memory:

```bash
layerkit proposal validate ./proc.json
layerkit memory append --type proposals --title "processor <id>" --vendor <vendor> --body-file ./proc-note.md
```

5. Point vendor map field rows at `processorId`. Java implementation via `layerkit-generate-java` (pure methods in `StrategyRegistry` — no I/O, no LLM).
6. Prefer builtins when semantics match; only author custom when docs require a distinct rule.

## Citation rules (hard)

- **Proposal-level** `sources[]` required (validate gate).
- **Payload-level** `sources[]` required for processor kind (citation gate).
- Excerpts must quote the hashing/normalization rule — not marketing blurb.
- If docs are silent → `needs-evidence`; do not invent SHA/normalization variants.

## Forbidden

- Inventing hash algorithms or phone formats without cited vendor/customer rule
- Network or LLM inside processor implementation
- Double-hashing already-hashed fields without evidence
- Applying privacy-affecting processors without privacy review when required

## Success criteria

- [ ] Dual sources (proposal + payload) with real excerpts
- [ ] `layerkit proposal validate` clean
- [ ] `processor-citation-required` eval posture satisfied
- [ ] Pure function semantics documented for Java/tests
