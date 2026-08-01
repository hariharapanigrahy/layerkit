---
name: layerkit-generate-java
description: Integrate vendors by editing the production datalayer directly; style-match; run the client package verification command.
---

# layerkit-generate-java

Modify the **existing** production datalayer (adapters, registry, router, tests) directly from evidence. Do not ask the CLI to generate an integration plan or source patch.

`project.json`:

```json
{
  "generate": {
    "moduleRoot": "apps/platform/integrations",
    "denyEdit": ["**/legacy/**"]
  }
}
```

## Protocol

1. Read existing production integration code, interfaces, mappers, tests, and package style.
2. Run `layerkit-deletion-first`: remove/update stale code/docs/tests before adding files.
3. Inspect the existing interface/datalayer and implement in **production paths**.
4. For every new file/function/export, list what it replaces; if it replaces nothing, justify why it must exist.
5. Run the client package verification command, such as the package's build/test/coverage CI target; then:
   ```bash
   layerkit doctor
   ```

## Forbidden

- AI calls in production adapter send paths
- Invented field maps
- Parallel facade beside an existing one
- Handing off while client package verification or doctor fails
- New adapter abstraction without explaining what existing file/function/export cannot be changed
- Treating generated plans or `.layerkit/out` files as production source code

## Success

- [ ] Production files updated by the agent after inspecting existing code
- [ ] Deletion-first pass complete; new files/functions/exports list what they replace
- [ ] Existing style/topology honored from source evidence
- [ ] Client package build/test/coverage command green
- [ ] Package verification green for primary intents
