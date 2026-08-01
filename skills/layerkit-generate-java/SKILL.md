---
name: layerkit-generate-java
description: Use an agent-facing integration plan to edit the production datalayer; style-match; tests ≥95% JaCoCo when Java.
---

# layerkit-generate-java

Modify the **existing** production datalayer (adapters, registry, router, tests) using the integrate plan as context. The plan is not generated production code.

```bash
layerkit generate --module-root <path-to-module> [--vendor <id>]
# Writes {projectDir}/out/INTEGRATE.md + integrate-plan.json
```

`project.json`:

```json
{
  "generate": {
    "moduleRoot": "apps/platform/integrations",
    "qualityRoots": ["apps/platform/integrations"],
    "denyEdit": ["**/legacy/**"]
  }
}
```

## Protocol

1. Style profile: `layerkit style-profile scan --root <repo>`
2. Run `layerkit-deletion-first`: remove/update stale code/docs/tests before adding files
3. `layerkit generate --module-root <module> [--vendor <id>]`
4. Read `{projectDir}/out/INTEGRATE.md` — topology, likely files, deny-edit rules
5. Inspect the existing interface/datalayer and implement in **production paths** listed in the plan
6. Module tests; then:
   ```bash
   layerkit doctor --quality --strict
   layerkit process dry-run --vendor <id> --intent <i>
   layerkit promote --vendor <id>
   ```

## Forbidden

- LLM on hot path (`track` / adapter send)
- Invented field maps
- Parallel facade beside an existing one
- Promoting while coverage/doctor fail
- New adapter abstraction without explaining what existing file/function/export cannot be changed
- Treating `INTEGRATE.md` or `integrate-plan.json` as generated source code

## Success

- [ ] Production files updated by the agent after inspecting existing code, with INTEGRATE.md used only as context
- [ ] Deletion-first pass complete; new files/functions/exports list what they replace
- [ ] Style/topology honored
- [ ] Module tests green; JaCoCo ≥ 0.95 when enforced
- [ ] Dry-run green for primary intents
