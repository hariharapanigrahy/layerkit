---
name: layerkit-generate-java
description: Agent implements enterprise Java client from applied maps using Facade/Strategy/Ports patterns and ≥95% JaCoCo coverage.
---

# layerkit-generate-java

```bash
layerkit generate --lang java
```

## What the CLI scaffolds

Under `{projectDir}/out/java`:

| Path | Role |
|------|------|
| `pom.xml` | Java 17, JUnit 5, **JaCoCo line ≥ 0.95** (`jacoco.minimum.line`) |
| `DESIGN_PATTERNS.md` | Required patterns + anti-patterns |
| `AGENT_TASK.md` | Filled vs empty vendors |
| `.../datalayer/DataLayerClient.java` | **Facade** — `track()` |
| `.../datalayer/vendor/VendorAdapter.java` | **Strategy** interface per vendor |
| `.../datalayer/strategy/StrategyRegistry.java` | Pure processor registry |
| `.../datalayer/privacy/PrivacyGate.java` | Privacy port (fail-closed live) |
| `.../datalayer/delivery/DeliveryClient.java` | Delivery port (no network in dry_run) |

## Agent steps

1. Read `AGENT_TASK.md` and `DESIGN_PATTERNS.md`.
2. Implement **filled** vendors only (one `VendorAdapter` per vendor).
3. Keep processors **pure** (register in `StrategyRegistry`); no LLM / no network on map path.
4. Wire `PrivacyGate` + `DeliveryClient` for dry_run first; live only after policy + real HTTP.
5. Add tests under `src/test/java` aiming **≥95% line** (100% for pure processors/privacy).
6. Run:

```bash
cd .layerkit/out/java && mvn test
layerkit doctor --quality --strict
layerkit promote --vendor <id>   # quality-gated; sets map status live
```

## Quality hooks

- `layerkit doctor --quality` — looks for `target/site/jacoco/jacoco.xml` (or csv) under `out/java`.
- `layerkit doctor --quality --strict` — **fails** if report missing or line rate &lt; 0.95.
- `layerkit promote` — same gate by default (`--no-strict` to skip for local experiments only).

## Rules

- Cite vendor docs in map/processor proposals.
- **No LLM on the hot path** (`DataLayerClient.track`).
- Prefer matching existing customer package/DI/HTTP stack over orphan trees.
- Java 17+ for enterprises.
