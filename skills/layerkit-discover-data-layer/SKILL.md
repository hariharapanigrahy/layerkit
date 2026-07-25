---
name: layerkit-discover-data-layer
description: Read-only discovery of the customer's domain events/fields from code; seeds questionnaire Q3–Q4 with source code.
---

# layerkit-discover-data-layer

Analyze the **customer data layer** (not vendor docs). Output feeds research and mapping.

## Protocol

1. Scan TS/JS and Java sources for event/intent types, track() calls, DTOs (AST/regex hints).
2. **Deny-paths** (never open): `.env`, `.env.*`, `**/*secret*`, `**/*credential*`, `**/id_rsa*`, `**/*.pem`, `**/keystore*`.
3. Prefer in-repo OpenAPI/curl for field hints (`source: openapi|curl|code`).
4. Draft `domain_spec` proposal JSON with `sources: [{ title, url: 'file://...', excerpt }]`.
5. Bootstrap questionnaire answers for **Q3 intents / Q4 fields** only when code supports them; residual gaps stay unanswered.
6. Append note to `{projectDir}/memory/research/` (redact PII). Next: `layerkit-research-vendor`.

## Forbidden

- Inventing domain fields not present in code or customer-accepted docs
- Reading secret/credential files
- Writing vendor maps (that is `layerkit-research-vendor`)
