---
name: layerkit-design-flow
description: Decide the simplest client-owned integration shape from code and vendor evidence; prefer updating existing mappers/adapters.
---

# layerkit-design-flow

Use this skill to decide how the client package should express a vendor integration change.

## Protocol

1. Read the existing integration topology: mappers, adapters, routers, registries, tests, and feature flags.
2. Read vendor evidence for the changed endpoint, payload, auth, batching, or ordering requirement.
3. Prefer changing the existing mapper/adapter path.
4. Use a multi-step flow in client code only when vendor evidence requires sequencing, branching, batching, or retries that are not already represented.
5. Before adding a new abstraction, document why the existing abstraction cannot be changed.
6. Update tests around the actual production path.

## Design Outputs

- Existing file/function to update.
- Stale code/docs/tests to delete or rewrite.
- Required source edits.
- Tests to add or update.
- Residual TODOs where the client datalayer cannot satisfy the vendor contract.

## Forbidden

- Designing a Layerkit runtime flow instead of client-owned source code.
- Adding a side registry/facade when the existing route/mapper can be edited.
- Inventing auth, endpoint, batching, or routing behavior without evidence.
- Finalizing while package verification fails.

## Success Criteria

- [ ] The chosen shape is grounded in existing client code.
- [ ] The smallest viable source edit is identified.
- [ ] New abstractions are justified by concrete existing-code limits.
- [ ] Verification path is clear before source edit begins.
