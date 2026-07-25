---
name: layerkit-author-map
description: Draft vendor_map proposal with sources from research evidence; never invent without evidence.
---

# layerkit-author-map

Author a **vendor_map** proposal only from cited evidence (research notes, OpenAPI, curl, customer docs).

## Protocol

1. Prerequisites: `layerkit-research-vendor` answer sheet + `layerkit-design-integration` shape = linear or hybrid.
2. Draft proposal:

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
    "status": "draft",
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

3. Every auth type, endpoint, eventName, and field row **must** map to a `sources[]` excerpt (or nested processor sources).
4. Missing evidence → omit the row and mark `needs-evidence` in summary/memory — **do not invent**.
5. Validate:

```bash
layerkit proposal validate ./map-proposal.json
layerkit memory append --type proposals --title "<vendor> map draft" --vendor <vendor> --body-file ./map-summary.md
```

6. Processors for transforms → `layerkit-author-processor`. Flow-only paths → `layerkit-design-flow`.
7. Submit for checker when ready: `layerkit proposal submit ./map-proposal.json --by <agentId>`

## Forbidden

- Inventing vendor field names, hash rules, or endpoints without citations
- Applying/promoting from this skill without maker-checker when strict
- Encoding vendor-specific field truth into Layerkit core

## Success criteria

- [ ] `sources[]` non-empty; each critical field has excerptable evidence
- [ ] `layerkit proposal validate` → no errors
- [ ] No uncited transform/processor references
- [ ] Residual gaps documented in memory
