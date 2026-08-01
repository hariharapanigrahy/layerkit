---
name: layerkit-author-processor
description: Author or update client-side transform/helper code from vendor docs with mandatory citations.
---

# layerkit-author-processor

Use this skill when a vendor contract requires normalization, hashing, formatting, date conversion, object shaping, or other deterministic helper logic in the client package.

These helpers are client-owned source code. They are not Layerkit runtime processors.

## Protocol

1. Identify the transform requirement from vendor docs/OpenAPI/curl and existing client mapper code.
2. Search for an existing helper before adding one.
3. Prefer updating an existing helper or mapper method.
4. Add a new helper only when no existing function can be changed cleanly.
5. For any new helper, state what it replaces. If it replaces nothing, justify why it must exist.
6. Add or update tests that prove the transform against cited examples.
7. Validate any map/proposal artifact only if the client uses one:

```bash
layerkit proposal validate ./proposal.json
layerkit map validate ./map.json
```

## Citation Rules

- Cite the vendor/customer rule for every non-obvious transform.
- Excerpts must cover the rule, such as hashing order, casing, phone format, timestamp unit, or nested object shape.
- If docs are silent, do not invent SHA variants, phone formats, timezone assumptions, or fallback defaults.

## Forbidden

- Network, credentials, or AI calls inside transform helpers.
- Double-hashing or re-normalizing without evidence.
- Adding a parallel helper when an existing mapper/helper should be changed.
- Creating Layerkit processor proposal artifacts as a substitute for editing source.

## Success Criteria

- [ ] Transform source code lives in the client package path.
- [ ] Existing code was updated or stale code was removed before adding a helper.
- [ ] Tests cover vendor examples or cited schema rules.
- [ ] Any remaining datalayer gap is a precise TODO in source and handoff.
