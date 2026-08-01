---
name: layerkit-author-map
description: Draft vendor_map proposal with sources from research evidence; never invent without evidence.
---

# layerkit-author-map

Author a **vendor_map** proposal only from cited evidence (research notes, OpenAPI, curl, customer docs).

## Protocol

1. Prerequisites: `layerkit-research-vendor` answer sheet + `layerkit-design-integration` shape = linear or hybrid.
2. Read OpenAPI/docs/curl evidence directly. Do not derive a map from operation names or schema property names alone; map only when vendor meaning and customer domain meaning are both evidenced.

3. **Explicit scaffold** when you already know the mapping from evidence:

```bash
layerkit proposal write map \
  --vendor <vendor> \
  --out ./map-proposal.json \
  --source "Events API=https://docs.example.com/api/events|event_name is required" \
  --endpoint POST:/v1/events@https://api.example.com \
  --intent purchase:Purchase \
  --field user.email:user_data.em \
  --agent <agentId> \
  --validate
```

- `--source title=url` is **required** (repeatable). Optional `|excerpt` after the URL.
- Does **not** auto-submit. Next tip: `layerkit proposal validate <file>`.

4. Or draft proposal JSON by hand:

```json
{
  "schemaVersion": 2,
  "kind": "vendor_map",
  "id": "map-<vendor>-v1",
  "vendor": "<vendor>",
  "summary": "<what changed>",
  "authoredBy": "agent",
  "status": "draft",
  "createdAt": "<ISO>",
  "sources": [
    { "title": "...", "url": "https://...", "excerpt": "..." }
  ],
  "payload": {
    "vendor": "<vendor>",
    "version": "1",
    "status": "map_complete",
    "documentation": [{ "title": "...", "url": "https://..." }],
    "auth": { "type": "bearer", "notes": "..." },
    "endpoint": { "method": "POST", "path": "/...", "baseUrl": "https://..." },
    "intents": { "purchase": { "eventName": "..." } },
    "fields": [
      {
        "domain": "user.email",
        "vendor": "user_data.em",
        "transform": { "type": "processor", "processorId": "..." },
        "optional": true
      }
    ]
  },
  "maker": { "type": "agent", "id": "<agent>" },
  "changeLog": "Initial map from docs"
}
```

5. Every auth type, endpoint, eventName, and field row **must** map to a `sources[]` excerpt (or nested processor sources).
6. Missing evidence → omit the row and mark `needs-evidence` in summary/memory — **do not invent**.
7. Validate + memory:

```bash
layerkit proposal validate ./map-proposal.json
layerkit memory append --type proposals --title "<vendor> map draft" --vendor <vendor> --body-file ./map-summary.md
```

8. Processors for transforms → `layerkit-author-processor`. Flow-only paths → `layerkit-design-flow`.
9. Submit for checker when ready: `layerkit proposal submit ./map-proposal.json --by <agentId>`

## Forbidden

- Inventing vendor field names, hash rules, or endpoints without citations
- Applying/promoting from this skill without maker-checker when strict
- Encoding vendor-specific field truth into Layerkit core
- Hardcoding one company's OpenAPI extension name as the only domain-op source in product code

## Success criteria

- [ ] `sources[]` non-empty; each critical field has excerptable evidence
- [ ] `layerkit proposal validate` → no errors
- [ ] No uncited transform/processor references
- [ ] Residual gaps documented in memory
