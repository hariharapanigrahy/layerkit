---
name: layerkit-research-vendor
description: Evidence-first vendor research (OpenAPI/curl/docs deepen); residual human only; customer-owned output.
---

# layerkit-research-vendor

You create integration knowledge from **primary evidence**. Core ships empty maps. Never invent.

## Protocol

1. Inspect skeleton (docs URLs only — not trusted field truth):

```bash
layerkit map show <vendor>
layerkit memory list --vendor <vendor>
```

2. Ingest **all** seeds the customer accepts: prose docs, OpenAPI/Swagger, curl samples, collections, customer code.
3. Prefer CLI (same as libs/research):
```bash
layerkit research openapi ./openapi.json --json
layerkit research curl ./sample.curl --json
layerkit research deepen ./hub.md --json
layerkit research fill --openapi ./openapi.json --curl ./sample.curl --hub ./hub.md --vendor <id> --out ./sheet.json
layerkit research gaps ./sheet.json
```
   - OpenAPI → **Q1** auth (securitySchemes only), **Q2** endpoints, **Q3** intent *candidates* (operationId + opaque `x-*` values), **Q4** body schema fields, **Q5** PII-ish name hints
   - curl → method, host, path, auth class (parse-only)
   - deepen hub links → enqueue openapi **before** asking humans
4. **Domain meaning is not vendor hardcoding.** Tools list evidence only. Binding wire ops → domain intents is:
   - project convention (`layerkit domain-binding show|init` → `memory/runbooks/domain-binding.json`), and
   - this skill + `layerkit-author-map` (cite extension / operationId / docs).
   - Generic: any `x-*-domain-op` may be treated as a domain-op *encoding* when convention allows — never special-case one customer prefix in core.
5. Fill remaining Q6–Q10 from evidence; record citations + `source` (`doc|openapi|curl|code|…`, not `human` when derived).
6. If a dimension is empty → **deepen L0–L4**. Residual questionnaire only after that (`residualGaps`).
7. Write research note (PII redacted):

```bash
layerkit memory append --type research --title "<vendor> research" --vendor <vendor> --body-file ./research-note.md
```

8. Hand off to `layerkit-design-integration` then `layerkit-author-map` (do not invent map rows here without evidence).
9. Ask human **only** for residual gaps; never open full questionnaire while OpenAPI/curl already answers Q1/Q2.

## Customer-owned output

- Proposals must cite sources the **customer** accepts (their contracts, approved doc URLs, their code).
- `third-party snippets ` and package seeds are **draft hints only** — re-verify every URL/excerpt before apply.
- Output artifacts live under the customer's `{projectDir}`.

## Forbidden

- Inventing hash/phone/auth/endpoint rules when evidence is silent → mark `needs-evidence`
- Opening full human questionnaire while machine-readable evidence remains
- Trusting third-party maps without customer re-verify
- Hardcoding Meta/Google/TikTok field names into core or skills as universal truth

## Success criteria

- [ ] Each answered Q has ≥1 citation + non-`human` source when derived
- [ ] Deepen log shows L0–L4 before any human ask
- [ ] Residual gaps listed; no silent invention
- [ ] Memory research note appended (redacted)
