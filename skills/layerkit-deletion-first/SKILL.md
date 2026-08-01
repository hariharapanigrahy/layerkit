---
name: layerkit-deletion-first
description: Deletion-first change discipline for Layerkit work. Use before adding code, files, exports, docs, tests, or abstractions; during heal/integration updates; and whenever Codex should prefer modifying or deleting existing code over additive implementation.
---

# layerkit-deletion-first

Use this skill before implementation work, especially before `layerkit-source-edit-client` edits production datalayer code.

Before adding code, identify existing code, docs, tests, fixtures, and package surfaces that can be removed or rewritten.

Before a large deletion/rewrite or strategic redirect, prove the new direction with one small passing gate: an eval, end-to-end QA check, contract-heal case, or before/after acceptance test.

## Protocol

1. Identify existing code, docs, tests, fixtures, scripts, exports, commands, and shims that can be removed or rewritten.
2. Prefer modifying or deleting existing code over adding files.
3. Do not add a new abstraction until the existing abstraction has been inspected and cannot reasonably change.
4. For every new file, function, export, command, fixture, or skill, state what it replaces.
5. If it replaces nothing, justify why the expansion is necessary.
6. Target net-negative or near-neutral LOC unless functionality truly expands.
7. For strategic redirects, record the proof step before continuing.

## Deletion Pass

Check these surfaces before adding:

- stale demos, design notes, launch scripts, sample-only assets
- legacy wrappers and compatibility aliases not required by public API
- tests for removed behavior
- duplicated command paths or old workflow names
- unused exports, fixtures, scripts, generated output, and package contents
- docs that describe non-current product paths

For heal/integration work, preserve only the spine:

`API spec/doc -> contract drift -> map/proposal update -> privacy/checker -> production datalayer integration -> client package verification`

Move required examples into `evals/fixtures`; delete demo/docs packaging around them.

## Final Report

Report:

- lines added/deleted and net delta
- files deleted
- new files/functions/exports and what each replaces
- legacy surfaces intentionally kept and why
- tests/gates run
- proof step for any strategic redirect
