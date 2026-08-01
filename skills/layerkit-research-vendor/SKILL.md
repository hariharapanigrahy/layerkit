---
name: layerkit-research-vendor
description: Evidence-first vendor research and contract updates (docs/OpenAPI → structured contract → drift vs map); residual human only.
---

# layerkit-research-vendor

You create or **update** integration knowledge from **primary evidence**. Core ships empty maps. Never invent.

**Contract update (heal)** is an agent-led production update path: human supplies OpenAPI/docs → AI agent curates structured contract → heal records drift/map proposal → AI agent updates existing source/tests. Do not route heal through `layerkit generate` or `INTEGRATE.md`.

## Protocol

### A. Contract heal

```bash
layerkit heal run --vendor <vendor> --openapi ./openapi.json \
  --module-root <production-module>
# pin + drift + map/proposal update; source edits are agent-owned
```

When the user gives a docs link instead of OpenAPI, you are the AI reader. Fetch/read the official docs, keep citations, and write a structured OpenAPI-compatible contract file from evidence before calling heal:

```text
.layerkit/out/contracts/<vendor>/openapi-from-doc.json
```

Then run:

```bash
layerkit heal run --vendor <vendor> --openapi .layerkit/out/contracts/<vendor>/openapi-from-doc.json \
  --module-root <production-module>
```

The CLI does not understand arbitrary docs or semantic field meaning. It records structured contract input and drift; you decide source edits from docs + code evidence. If docs are ambiguous, preserve uncertainty in the contract notes and leave unresolved TODOs rather than inventing fields.

Review `out/CONTRACT_DRIFT.json`.
If drift says one vendor field was removed and another was added, inspect docs and existing source before deciding it is a rename. When evidence is strong, pass decisions to heal:

```json
[
  {
    "fromVendor": "email",
    "toVendor": "email_id",
    "domain": "email",
    "confidence": "high",
    "evidence": ["OpenAPI removed email and added email_id for the same request value"]
  }
]
```

```bash
layerkit heal run --vendor <vendor> --openapi ./openapi.json \
  --module-root <production-module> \
  --rename-decisions ./rename-decisions.json
```

After heal, edit the real adapter/interface/test files yourself. If the field does not exist in the interface or datalayer, add a localized TODO only in the production change and call it out in review.

### B. Supporting evidence work

Read official docs/OpenAPI/curl examples directly as the AI agent. Curate a structured contract/proposal with citations, then use deterministic CLI only to validate proposals, run heal on a structured contract, and dry-run maps. Privacy classification belongs to `layerkit-privacy-review`.

### C. Domain binding

Domain meaning is project convention (`layerkit domain-binding show|init`), not vendor hardcoding. Cite extension / operationId / docs.

### D. Memory

```bash
layerkit memory append --type research --title "<vendor> research|heal" --vendor <vendor> --body-file ./research-note.md
```

Include drift severity when heal. Residual questionnaire only after deepen L0–L4.

## Forbidden

- Inventing hash/phone/auth/endpoint rules when evidence is silent
- Guessing field renames from names alone; source edits require docs/code evidence
- Ignoring applied map on heal (must diff / surgical update)
- Opening full human questionnaire while OpenAPI/docs/curl already answer Q1/Q2
- Trusting third-party maps without customer re-verify
- Self-approve in strict maker-checker

## Success criteria

- [ ] Structured contract pinned when OpenAPI or docs were supplied
- [ ] Drift reviewed if map existed (severity in note)
- [ ] Each answered Q has ≥1 citation
- [ ] Map proposal from structured contract with sources[]
- [ ] `layerkit agent next` advances past research after apply
