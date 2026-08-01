# API Stability

Layerkit public API stability is scoped to the agent-workbench use case.

## Stable Surface

- `layerkit install`
- `layerkit doctor`
- `layerkit agent status|start|next|mark-done`
- `layerkit memory list|show|append|search|index`
- `layerkit map list|show|validate|migrate`
- `layerkit proposal write|submit|validate|approve|reject|list|apply`
- package exports used by the CLI and eval gates

## Not Stable

- internal TypeScript modules under `libs/**`
- eval fixture shapes outside documented `case.json`
- synthetic vendor examples
- platform installer internals

Breaking CLI changes require a release note and an eval update. Internal refactors only need the existing build/test/eval gates to stay green.
