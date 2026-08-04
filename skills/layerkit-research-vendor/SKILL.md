---
name: layerkit-research-vendor
description: Evidence-first vendor research and contract updates (docs/OpenAPI → structured contract → drift vs map); residual human only.
---

# layerkit-research-vendor

You create or **update** integration knowledge from **primary evidence**. Core ships empty maps. Never invent.

**Contract update (heal)** is an agent-led production update path: human supplies OpenAPI/docs → AI agent reads/cites evidence → AI agent updates existing maps/source/tests. Do not route heal through deterministic source editing, code generation, or generated patch plans.

## Protocol

### A. Contract heal

When the user gives OpenAPI or docs, you are the AI reader. Fetch/read the official evidence, keep citations, and compare it to the existing map/interface/datalayer yourself.

```text
.layerkit/out/contracts/<vendor>/openapi-from-doc.json
```

The CLI is tooling only: it validates explicit artifacts and package health, but it does not understand arbitrary docs, semantic field meaning, or source edits. If docs are ambiguous after evidence review, preserve uncertainty in notes and leave localized TODOs rather than inventing fields.

If one vendor field was removed and another was added, inspect docs and existing source before deciding it is a rename. Record your decision in the review note:

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

Edit the real adapter/interface/test files yourself. If the field does not exist in the interface or datalayer, add a localized TODO only in the production change and call it out in review.

### B. Supporting evidence work

Read official docs/OpenAPI/curl examples directly as the AI agent. Curate a structured contract/proposal with citations, then use deterministic CLI only to validate explicit proposals and package health. Privacy classification belongs to `layerkit-privacy-review`.

### C. Domain meaning

Domain meaning comes from customer code plus vendor evidence, not from operation names alone. Cite docs, schemas, examples, and source files for every non-obvious mapping.

### D. Memory

```bash
layerkit memory append --type research --title "<vendor> research|heal" --vendor <vendor> --body-file ./research-note.md
```

Include drift severity when heal.

### E. Residual human stop conditions

Ask a human only after you have checked the available official docs/OpenAPI/curl examples, current map, current source, and relevant tests. The question must be narrow and name the exact missing decision.

Stop and ask a residual human question when:

- official evidence conflicts and no source/test pattern decides which behavior is current
- the vendor contract requires a customer-owned business decision, such as consent, hashing, identifier preference, or event routing
- the client datalayer lacks a field/object needed by the vendor and adding it changes product semantics
- credentials, tenant routing, production endpoints, or rollout safety cannot be inferred from checked-in configuration
- applying the change would remove behavior that existing tests or code appear to rely on

Do not open a broad questionnaire while OpenAPI/docs/curl/source evidence can still answer the next question.

## Forbidden

- Inventing hash/phone/auth/endpoint rules when evidence is silent
- Do not guess field renames from names alone; source edits require docs/OpenAPI/changelog evidence
- Ignoring applied map on heal (must diff / surgical update)
- Opening full human questionnaire while OpenAPI/docs/curl already answer Q1/Q2
- Trusting third-party maps without customer re-verify
- Self-approve in strict maker-checker

## Success criteria

- [ ] OpenAPI/docs evidence reviewed with citations
- [ ] Existing map/source reviewed if map existed
- [ ] Each answered Q has ≥1 citation
- [ ] Map/source updates from evidence with sources[]
- [ ] `layerkit agent next` advances past research after apply
