---
name: layerkit-research-vendor
description: Evidence-first vendor research and contract updates (OpenAPI pin + drift vs map); residual human only.
---

# layerkit-research-vendor

You create or **update** integration knowledge from **primary evidence**. Core ships empty maps. Never invent.

**Contract update (heal)** is the same pipeline step (`research`), not a parallel product: human supplies OpenAPI/docs → pin → drift → map-from-openapi → continue design → generate.

## Protocol

### A. Contract heal (prefer when OpenAPI exists)

```bash
layerkit heal run --vendor <vendor> --openapi ./openapi.json \
  --module-root <production-module> --apply-code
# pin + drift + map apply + integrate plan + out/pr/* + optional code write
```

Review `out/CONTRACT_DRIFT.json`, `out/INTEGRATE.md`, `out/pr/<vendor>-*/PR.md`.  
Open PR from the package (or files already written with `--apply-code`).

### B. Supporting evidence tools

```bash
layerkit research openapi ./openapi.json --json
layerkit research curl ./sample.curl --json
layerkit research deepen ./hub.md --json
layerkit research gaps ./sheet.json
```

- OpenAPI → Q1 auth, Q2 endpoints, Q3 intent candidates, Q4 body fields, Q5 PII-ish names  
- curl → method, host, path, auth class  
- deepen hub → enqueue openapi before humans  

### C. Domain binding

Domain meaning is project convention (`layerkit domain-binding show|init`), not vendor hardcoding. Cite extension / operationId / docs.

### D. Memory

```bash
layerkit memory append --type research --title "<vendor> research|heal" --vendor <vendor> --body-file ./research-note.md
```

Include drift severity when heal. Residual questionnaire only after deepen L0–L4.

## Forbidden

- Inventing hash/phone/auth/endpoint rules when evidence is silent  
- Ignoring applied map on heal (must diff / surgical update)  
- Opening full human questionnaire while OpenAPI already answers Q1/Q2  
- Trusting third-party maps without customer re-verify  
- Self-approve in strict maker-checker  

## Success criteria

- [ ] Contract pinned when OpenAPI was supplied  
- [ ] Drift reviewed if map existed (severity in note)  
- [ ] Each answered Q has ≥1 citation  
- [ ] Map proposal from OpenAPI with sources[]  
- [ ] `layerkit agent next` advances past research after apply  
