---
name: layerkit-source-edit-client
description: Integrate vendors by editing the production datalayer directly; style-match; run the client package verification command.
---

# layerkit-source-edit-client

Modify the **existing** production datalayer and production source files (adapters, registry, router, tests) directly from evidence. Do not ask the CLI for plan files or source patches.

Optional `project.json` source-edit hints:

```json
{
  "sourceEdit": {
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
6. For any strategic redirect or broad rewrite, run a small proof step first: an eval, end-to-end QA check, contract-heal case, or before/after acceptance test.

## Mapping Rules

- If the vendor renames `email` to `email_id` and the client still exposes `getEmail()`, update the existing vendor setter to use the existing client getter: `payload.setEmailId(event.getEmail())`.
- If the vendor removes a field, remove the stale mapping and update tests. Do not keep a wrapper for removed vendor behavior.
- If the vendor adds a field and the client interface/datalayer already has equivalent data, map the existing client field into the new vendor shape.
- If no client source represents the required data, treat it as an unsupported datalayer gap: leave a localized TODO and handoff note with the missing interface/datalayer gap.

## New Vendor Integrations

- Start from existing client vendor integrations, registries, privacy checks, tests, naming, and error handling.
- If a matching adapter/mapper pattern exists, extend that pattern for the new vendor and wire it into the existing registry.
- Add a new file only when there is no existing file that should own the vendor-specific behavior; document what existing pattern it follows and why modifying an existing file was not enough.
- Keep shared routing/runtime decisions in the client package. Layerkit only supplies agent skills and exact artifact rails.

## Forbidden

- AI calls in production adapter send paths
- Invented field maps
- Parallel facade beside an existing one
- Handing off while client package verification or doctor fails
- New adapter abstraction without explaining what existing file/function/export cannot be changed
- Treating generated plans, package metadata, or staging files as source edits

## Success

- [ ] Production files updated by the agent after inspecting existing code
- [ ] Deletion-first pass complete; new files/functions/exports list what they replace
- [ ] Existing style/topology honored from source evidence
- [ ] Client package build/test/coverage command green
- [ ] Package verification green for primary intents
- [ ] Strategic redirects have a passing proof step before broad edits
