---
name: layerkit-design-routing
description: Author declarative RoutingPolicy (vendor sets, expansions, routes) so one domain event fans out without app if/else or tag combinatorial explosion.
---

# layerkit-design-routing

Design **customer-owned** routing under `{projectDir}/routing.json` (or `routing/{id}.json`).

Runtime is deterministic: `evaluateRouting` → plan → `trackRouted` / map apply. **No LLM on the hot path.** Do not hardcode business taxonomies into Layerkit core — only into the project store.

## When to use

- Different attribute values should reach **different vendor sets**
- One domain fact should emit **additional intents** for a subset of vendors
- Avoiding N×M tag/trigger matrices or application `if/else` per vendor

## Protocol

1. Discover domain attributes used for decisions (segment, product id, region, …) via `layerkit-discover-data-layer`.
2. Define **vendor sets** (named groups of map ids) — membership changes without new rules.
3. Define **routes**: condition + intent → vendor set (`priority`, optional `stop`).
4. Optional **expansions**: when condition on base event, emit extra intents (`keepBaseIntent` default true).
5. Write design decision to memory (rationale, sets, residual human questions).
6. Author `routing_policy` proposal with `sources[]` (product brief, analytics plan — not invented vendors).
7. Validate + plan dry-run:

```bash
layerkit route validate
layerkit route plan --event-file ./sample-event.json
layerkit process dry-run --route --event-file ./sample-event.json
layerkit proposal validate ./routing-proposal.json
# submit / approve under strict maker-checker, then:
layerkit proposal apply ./routing-proposal.json
```

8. App/runtime:

```ts
import { trackRouted } from 'layerkit';
import { loadRoutingPolicy } from 'layerkit/routing';

const policy = loadRoutingPolicy(projectDir);
await trackRouted(event, maps, { mode: 'dry_run', projectDir, routing: policy });
// or routing: true to load routing.json from projectDir
```

## Rule sketch (generic)

```json
{
  "schemaVersion": 1,
  "id": "default",
  "version": "1.0.0",
  "vendorSets": [
    { "id": "set_all", "vendors": ["vendor_a", "vendor_b"] },
    { "id": "set_narrow", "vendors": ["vendor_a"] },
    { "id": "set_secondary", "vendors": ["vendor_b"] }
  ],
  "expansions": [
    {
      "id": "exp_extra",
      "when": { "op": "in", "path": "product.id", "value": ["sku_x"] },
      "emit": [{ "intent": "secondary_intent" }],
      "keepBaseIntent": true
    }
  ],
  "routes": [
    {
      "id": "route_narrow",
      "priority": 10,
      "intent": "base_intent",
      "when": { "op": "eq", "path": "context.segment", "value": "narrow" },
      "to": "set_narrow",
      "stop": true
    },
    { "id": "route_base", "intent": "base_intent", "to": "set_all" },
    { "id": "route_secondary", "intent": "secondary_intent", "to": "set_secondary" }
  ]
}
```

## Forbidden

- Inventing vendor ids not present as maps in the project store
- Encoding thousands of one-off triggers instead of sets + rules
- Putting customer-sensitive taxonomy into Layerkit package source
- LLM decisions on the send path

## Success criteria

- [ ] `layerkit route plan` matches expected vendor×intent table for fixture events
- [ ] `process dry-run --route` returns results with `ruleIds`
- [ ] Policy applied via proposal; `routing.json` loadable
- [ ] Residual human only for true product ambiguity
