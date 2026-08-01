# Layerkit cheat sheet

One-page operator card. Details: [AGENT_GOLDEN_PATH.md](./AGENT_GOLDEN_PATH.md) · skills `layerkit-*`.

```bash
# print this from CLI
layerkit cheatsheet
```

---

## Install / doctor

```bash
npm i -g layerkit   # or: npx layerkit …
layerkit install --platform claude|cursor|codex|copilot|opencode|openhands|factory-droid|antigravity \
  --hooks enabled --poc
layerkit doctor
layerkit doctor --quality --strict   # JaCoCo when Java module present
```

Store: `--project-dir` → `LAYERKIT_PROJECT_DIR` → `layerkit.path.json` → `.layerkit`

---

## Pipeline (lead agent)

```bash
layerkit agent status          # shows mode: full|heal
layerkit agent next
layerkit agent mark-done --step discover|research|design|author|privacy|generate|handoff
```

Order: **discover → research → design → author → privacy → generate → handoff**
Heal: discover auto-done (`mode: heal`).

```bash
layerkit agent multi --vendor <v> [--mode heal] [--openapi <f>] [--module-root <dir>]
# skill: layerkit-multi-agent
```

---

## Contract heal (update integration)

Human supplies new OpenAPI or docs:

```bash
layerkit heal run --vendor <v> --openapi <spec.json> \
  --module-root <production-module>
# → pin contract, apply map, update adapter/test bodies directly

# Optional when an agent has evidence that a removed field was renamed:
layerkit heal run --vendor <v> --openapi <spec.json> \
  --module-root <production-module> \
  --rename-decisions ./rename-decisions.json

layerkit process dry-run --vendor <v> --intent <i>
```

Docs-link-only heal is skill/AI work: read/cite docs, write a structured contract file, then run `heal --openapi <contract>`.

Evidence only · map fields from structured contract only.

---

## Generate (production module)

```bash
layerkit style-profile scan --root .
layerkit generate --module-root <dir> [--vendor <v>]
# → out/INTEGRATE.md  (context; agent edits production module)
```

`project.json`:

```json
{ "generate": { "moduleRoot": "path/to/module" } }
```

---

## Dry-run / promote

```bash
layerkit process dry-run --vendor <v> --intent <i>
layerkit fix dry-run --map … --patches …     # evidence-only fixes, loop ≤3
layerkit promote --vendor <v>                # quality + privacy + dry-run gates
```

---

## Human-only gates

| Step | Who |
|------|-----|
| `proposal approve` (strict) | checker ≠ maker |
| Privacy / legal basis gaps | human |
| `promote` to live | human / CI after gates |
| Checker skill | **read-only** — never approve/apply |

---

## Forbidden

- Invent map fields/endpoints without docs/OpenAPI/curl
- Self-approve in STRICT maker-checker
- LLM on `track()` / adapter hot path
- Two agents patching the same registry (use `integrator:registry` only)
- Scaffold side-project merge when integrate mode applies

---

## Skills (by role)

| Role | Skill |
|------|--------|
| Lead | `layerkit-orchestrate-integration` · `layerkit-multi-agent` |
| Discover | `layerkit-discover-data-layer` |
| Research | `layerkit-research-vendor` |
| Map / processor | `layerkit-author-map` · `layerkit-author-processor` |
| Style / code | `layerkit-align-client-style` · `layerkit-generate-java` |
| Privacy / check | `layerkit-privacy-review` · `layerkit-checker-assist` |
| Resume | `layerkit-session-handoff` |
