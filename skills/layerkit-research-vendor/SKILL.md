---
name: layerkit-research-vendor
description: Evidence-first vendor research — docs/OpenAPI/curl/code before human questionnaire; draft vendor_map proposal with sources.
---

# layerkit-research-vendor

You create the integration knowledge. Core ships empty maps. **Evidence-first** (never invent).

## Protocol

1. `layerkit map show <vendor>` — open skeleton / seed URLs
2. Ingest **all** seeds: prose docs, OpenAPI/Swagger, curl samples, collections, customer code
3. Use research libs (deterministic):
   - `parseOpenAPI` → fill **Q1 auth** / **Q2 endpoints** (`source: openapi`)
   - `parseCurl` → method, host, path, Authorization class (`source: curl`)
   - `planDeepen` / hub links → enqueue `openapi.json` **before** asking humans
4. Fill Q1–Q10 from evidence; record citations + `source` (not human when derived)
5. If a dimension is empty → **deepen L0–L4** (expand links, `$ref`, repo samples). Residual questionnaire only after that (`residualGaps`)
6. Draft proposal JSON with `sources: [{title,url,excerpt}]`
7. `layerkit proposal validate ./proposal.json`
8. Append research note to `{projectDir}/memory/research/` (emails redacted)
9. Ask human only for residual gaps; then `layerkit proposal apply`

## Forbidden

- Inventing hash/phone/auth/endpoint rules when evidence is silent → mark `needs-evidence`
- Opening full human questionnaire while OpenAPI/curl already answers Q1/Q2
