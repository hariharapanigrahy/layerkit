---
name: layerkit-generate-java
description: Implement enterprise Java client matching style profile; Facade/Strategy/Ports; tests ≥95% JaCoCo.
---

# layerkit-generate-java

Scaffold + implement the deterministic Java client from applied maps/flows. **Style-match** the customer codebase.

```bash
layerkit generate --lang java
```

## What the CLI scaffolds

Under `{projectDir}/out/java`:

| Path | Role |
|------|------|
| `pom.xml` | Java 17, JUnit 5, **JaCoCo line ≥ 0.95** |
| `DESIGN_PATTERNS.md` | Required patterns + anti-patterns |
| `AGENT_TASK.md` | Filled vs empty vendors |
| `.../datalayer/DataLayerClient.java` | **Facade** — `track()` |
| `.../datalayer/vendor/VendorAdapter.java` | **Strategy** interface |
| `.../datalayer/strategy/StrategyRegistry.java` | Pure processor registry |
| `.../datalayer/privacy/PrivacyGate.java` | Privacy port (fail-closed live) |
| `.../datalayer/delivery/DeliveryClient.java` | Delivery port (no network in dry_run) |

## Agent steps

1. Read style profile from memory (`layerkit-align-client-style`) + `AGENT_TASK.md` + `DESIGN_PATTERNS.md`.
2. Prefer extending customer package/DI/HTTP stack over orphan `{projectDir}/out/java` trees when integrating into monorepos.
3. Implement **filled** vendors only (one `VendorAdapter` per vendor with evidence-backed maps).
4. Keep processors **pure** (register in `StrategyRegistry`); no LLM / no network on map path.
5. Wire `PrivacyGate` + `DeliveryClient` for dry_run first; live only after policy + real HTTP.
6. Add tests under `src/test/java` aiming **≥95% line** (100% for pure processors/privacy).
7. Run:

```bash
cd .layerkit/out/java && mvn test
layerkit doctor --quality --strict
layerkit process dry-run --vendor <id> --intent <i>
# promote only after quality + checker
layerkit promote --vendor <id>
```

## Quality hooks

- `layerkit doctor --quality` — JaCoCo under `out/java`
- `layerkit doctor --quality --strict` — fails if missing or line rate &lt; 0.95
- `layerkit promote` — same gate by default

## Forbidden

- LLM on hot path (`DataLayerClient.track`)
- Implementing empty vendors with invented field maps
- Skipping style profile when customer client code exists
- Promoting while coverage/doctor fail

## Success criteria

- [ ] Style profile applied (package/DI/HTTP named in notes)
- [ ] `mvn test` green; JaCoCo ≥ 0.95
- [ ] Dry-run succeeds for primary intents
- [ ] Citations remain on maps/processors used by generated code
