---
name: layerkit-discover-data-layer
description: Read customer code for domain events/fields; deny secrets; emit domain_spec proposal with source:code.
---

# layerkit-discover-data-layer

Analyze the **customer data layer** (not vendor docs). Output is a `domain_spec` proposal that seeds Q3–Q4.

## Protocol

1. List candidate files with narrow deterministic tools (`rg --files`, exact symbol search), then read source yourself. Do not use deterministic heuristics to infer business domains.
2. Scan TS/JS/Java (and similar) as the AI agent:
   - event / intent type names
   - analytics or vendor emit call sites
   - DTOs / domain models for user, cart, purchase
3. **Deny-paths** (never open or paste):
   - `.env`, `.env.*`
   - `**/*secret*`, `**/*credential*`
   - `**/id_rsa*`, `**/*.pem`, `**/keystore*`, `**/*.p12`
4. Prefer in-repo OpenAPI, JSON Schema, or redacted curl for field hints (`source: openapi|curl|code`).
5. Draft **domain_spec** proposal shape:

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

6. Bootstrap questionnaire Q3 (intents) / Q4 (fields) **only** when code supports them; residual gaps stay unanswered (`source: unanswered`).
7. Persist:

```bash
layerkit proposal validate ./domain-spec.json
layerkit memory append --type research --title "domain discovery" --vendor general --body-file ./discovery-note.md
```

8. Next: `layerkit-research-vendor` (per target vendor).

## Multi-vendor packages

When the client package already integrates **multiple vendors** (adapters, mappers, gateways, destinations):

1. Inventory sibling vendor paths with `file://` evidence: adapters, mappers, registry/router wire-up, privacy hooks, and sibling tests.
2. Name the **existing path** a new vendor should follow (module root, registry entry, test layout) — do not invent a parallel package tree.
3. Prefer extending the same module root and registry pattern used by siblings; residual only when no sibling path exists.
4. Record which vendors already ship so research/design can clone the proven structure for the next vendor.

Example note shape:

```text
# multi-vendor inventory
- vendors_present: [acme, beacon]
- adapter_root: src/vendors/*
- registry: src/registry.ts
- sibling_reference: file://src/vendors/acme/adapter.ts
- test_sibling: file://tests/vendors/acme.test.ts
- new_vendor_path: follow sibling under src/vendors/<id>/ + registry wire + clone tests
```

## Forbidden

- Inventing domain fields not present in code or customer-accepted docs
- Reading secret/credential files
- Writing `vendor_map` / processor payloads here
- Inventing a parallel facade/module tree when sibling vendor adapters already exist

## Success criteria

- [ ] Every `sources[]` entry is `file://` or customer-accepted URL with real excerpt
- [ ] No deny-path content in proposal or memory
- [ ] `layerkit proposal validate` has zero errors (warnings OK)
- [ ] Residual gaps listed explicitly; none silently filled
- [ ] Multi-vendor packages list sibling vendor paths and the path a new integration must follow
