---
name: layerkit-discover-data-layer
description: Read customer code for domain events/fields; deny secrets; emit domain_spec proposal with source:code.
---

# layerkit-discover-data-layer

Analyze the **customer data layer** (not vendor docs). Output is a `domain_spec` proposal that seeds Q3–Q4.

## Protocol

1. Scan TS/JS/Java (and similar) for:
   - event / intent type names
   - `track()` / analytics emit call sites
   - DTOs / domain models for user, cart, purchase
2. **Deny-paths** (never open or paste):
   - `.env`, `.env.*`
   - `**/*secret*`, `**/*credential*`
   - `**/id_rsa*`, `**/*.pem`, `**/keystore*`, `**/*.p12`
3. Prefer in-repo OpenAPI, JSON Schema, or redacted curl for field hints (`source: openapi|curl|code`).
4. Draft **domain_spec** proposal shape:

```json
{
  "schemaVersion": 2,
  "kind": "domain_spec",
  "id": "domain-spec-<customer>-v1",
  "summary": "Customer domain intents/fields from code",
  "authoredBy": "agent",
  "status": "draft",
  "createdAt": "<ISO>",
  "sources": [
    { "title": "<file role>", "url": "file://<repo-relative-path>", "excerpt": "<short>" }
  ],
  "payload": {
    "id": "<customer-or-commerce>",
    "version": "0.1.0",
    "description": "...",
    "intents": [{ "id": "purchase", "description": "..." }],
    "fields": [
      { "path": "user.email", "type": "string", "description": "...", "required": false }
    ]
  },
  "maker": { "type": "agent", "id": "<agent>" }
}
```

5. Bootstrap questionnaire Q3 (intents) / Q4 (fields) **only** when code supports them; residual gaps stay unanswered (`source: unanswered`).
6. Persist:

```bash
layerkit proposal validate ./domain-spec.json
layerkit memory append --type research --title "domain discovery" --vendor general --body-file ./discovery-note.md
```

7. Next: `layerkit-research-vendor` (per target vendor).

## Forbidden

- Inventing domain fields not present in code or customer-accepted docs
- Reading secret/credential files
- Writing `vendor_map` / processor payloads here
- Filling VENDOR_SLOTS catalog maps

## Success criteria

- [ ] Every `sources[]` entry is `file://` or customer-accepted URL with real excerpt
- [ ] No deny-path content in proposal or memory
- [ ] `layerkit proposal validate` has zero errors (warnings OK)
- [ ] Residual gaps listed explicitly; none silently filled
