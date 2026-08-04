---
name: layerkit-inventory-surfaces
description: Inventory package languages/surfaces for multi-lang heals; session file used by Layerkit to enforce all languages updated before PR.
---

# layerkit-inventory-surfaces

Before research/source-edit on a multi-language package, list **every language or surface** the package supports so Layerkit can block PR/handoff until each is `updated` or explicit `residual`.

This step is **required for heal and full**. Domain discover may be skipped on heal; **surfaces is never skipped**.

## Protocol

1. Walk the package (source:code): e.g. `**/server/node`, `server/python`, `server/ruby`, `server/php*`, `server/java`, `server/go`, `server/dotnet`, `server/nextjs`, client UIs.
2. Write session inventory:

```text
{projectDir}/memory/runbooks/surface-inventory.json
```

```json
{
  "schemaVersion": 1,
  "package": "org/repo",
  "languages": [
    {
      "id": "node",
      "roots": ["fixed-price-subscriptions/server/node"],
      "status": "pending"
    },
    {
      "id": "python",
      "roots": ["fixed-price-subscriptions/server/python"],
      "status": "pending"
    }
  ],
  "notes": "Inventoried from package layout; source:code"
}
```

3. Put the same JSON (or a pointer + summary) in mark-done `--evidence`.
4. Later, during **source-edit**, update each language:
   - `"status": "updated"` + `"paths": ["…/server.js"]` when production files for that language were changed, or
   - `"status": "residual"` + `"residual": "why not changed (SDK gap, out of scope, …)"`
5. Layerkit **rejects** source-edit complete / handoff while any language is still `pending`.

## Forbidden

- Listing only one language when the package clearly has more (freestyle single-lang heal)
- Marking `updated` without real paths
- Marking `residual` without a concrete residual reason
- Skipping this step on heal

## Success

- [ ] `surface-inventory.json` exists with ≥1 language and non-empty `roots[]`
- [ ] Evidence cites package layout (source:code)
- [ ] Agent understands that multi-lang completeness is enforced before PR
