# Layerkit

[![CI](https://github.com/hariharapanigrahy/layerkit/actions/workflows/ci.yml/badge.svg)](https://github.com/hariharapanigrahy/layerkit/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/layerkit.svg)](https://www.npmjs.com/package/layerkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](./package.json)

### Agent toolkit: AI agents that build vendor integrations **like developers**

Layerkit does **not** ship or maintain a vendor catalog. Agents research **any** vendor from docs/OpenAPI/curl, author customer-owned maps/processors/flows, pass maker-checker + dry-run, then your app sends for real (adapters/SDK or Layerkit live delivery). Runtime `track()` stays deterministic — **no LLM on the hot path**.

**Contributions welcome** — see [CONTRIBUTING.md](./CONTRIBUTING.md). Best contributions: **skills** and **process evals**, not pre-built vendor maps.

---

## Install (npm)

```bash
# CLI (recommended for agents)
npm install -g layerkit
# or one-shot
npx layerkit --help

# In an app (maps + optional runtime imports)
npm install layerkit
```

Library imports (ESM, Node ≥20):

```ts
import { track, trackRouted } from 'layerkit';
import { applyVendorMap } from 'layerkit/map-engine';
import { createVendorMemoryStore } from 'layerkit/store';
import { createDeliverySimulator } from 'layerkit/delivery';
import { loadPrivacyPolicy, evaluatePrivacy } from 'layerkit/privacy';
import { createObservationBus } from 'layerkit/observation';
import { evaluateRouting, loadRoutingPolicy } from 'layerkit/routing';
```

> **Apps must provide the glue.** `track()` produces a `TrackResult` but does not send it. Your application is responsible for connecting `TrackResult` to `createDeliverySimulator().deliver()`. See the [Production Send Path](#production-send-path) section and [docs/AGENT_GOLDEN_PATH.md](./docs/AGENT_GOLDEN_PATH.md) for a complete example.

## Production Send Path

`track(event, maps, { projectDir, mode })` is the deterministic runtime layer. It selects vendor maps, applies vendor maps or flows, evaluates privacy, and produces `TrackResult` plus diagnostics / observations when needed.

`track()` does not perform production HTTP delivery. Flow execution is also deterministic and does not open live HTTP in the runtime path. Flow live HTTP is unsupported inside runtime; network delivery is handled by the delivery layer after runtime completes.

```text
Application
  │
  ▼
track(event)
  │
  ▼
Vendor selection
  │
  ▼
Map / Flow execution
  │
  ▼
Privacy + Observation
  │
  ▼
TrackResult
  │
  ▼
DeliverySimulator / deliver()
  │
  ▼
sendWithRetry()
  │
  ▼
Vendor API
```

The delivery layer is responsible for live network communication, retries, idempotency, DLQ handling, and HTTP failures. **Applications must provide the glue** — `track()` does not call `deliver()` automatically.

Minimal send glue — architecture (your app provides this):

```text
1. track(event, maps, opts)
      → TrackResult { results: VendorTrackResult[] }

2. Application inspects result.results
      → build a DeliveryRequest per vendor
        (url / method / headers come from your vendor map config,
         wire comes from VendorTrackResult.wire)

3. createDeliverySimulator({ projectDir, allowNetwork: true })
      .deliver(deliveryRequest)
```

> **Unsupported:** flow live HTTP inside runtime is not supported. Do not expect `track()` or a flow step to open network connections. Network delivery always happens in the delivery layer, after runtime completes.

Delivery modes:

| Mode | Network | Behavior |
|------|---------|----------|
| `dry_run` | No | Simulated success, no network calls |
| `shadow` | No | Simulated success, no network calls |
| `live` | Yes, only when explicitly allowed | Performs HTTP delivery with retry / idempotency / DLQ handling |

See the [Runtime Send Path section in docs/AGENT_GOLDEN_PATH.md](./docs/AGENT_GOLDEN_PATH.md#runtime-send-path) for the full send-path explanation.

`track(event, maps, { projectDir, mode })` loads privacy policies and flow refs from the project store, emits audit events when `projectDir` is set, and returns `diagnostics` / `filteredOut` when no vendor is eligible (never silent empty success).

**Routing (declarative fan-out):** author a customer-owned `RoutingPolicy` (vendor sets + optional intent expansions + routes). Use `trackRouted` or CLI `route plan` / `process dry-run --route` so attribute-based vendor selection stays out of app `if/else` and tag matrices. See skill `layerkit-design-routing`.

---

## Agent quick start

**Cheat sheet (one page):** [docs/CHEATSHEET.md](./docs/CHEATSHEET.md) · `layerkit cheatsheet`
**Day-1 any-vendor path:** [docs/AGENT_GOLDEN_PATH.md](./docs/AGENT_GOLDEN_PATH.md) (orchestrate + CLI only). For the runtime send path, see the runtime send-path section in that doc.

Paste into your coding agent:

```txt
Install Layerkit for this repo using https://raw.githubusercontent.com/hariharapanigrahy/layerkit/main/docs/agent-install-prompt.md
```

Manual:

```bash
npm install -g layerkit

cd /path/to/your/app
layerkit install --platform claude --hooks enabled --auto-map-updates enabled --poc
# platforms: codex|claude|cursor|copilot|opencode|openhands|factory-droid|antigravity
# optional: --project-dir integrations/layerkit  (default .layerkit)
layerkit doctor
```

### Project store path

Layerkit stores maps, proposals, and memory under a **project directory** (default `.layerkit`):

| Priority | Source |
|----------|--------|
| 1 | CLI `--project-dir <path>` |
| 2 | Env `LAYERKIT_PROJECT_DIR` |
| 3 | Repo pointer `layerkit.path.json` / `layerkit.json` |
| 4 | Default `{repo}/.layerkit` |

Install may prompt on TTY. Doctor prints the resolved path. Memory lives at `{projectDir}/memory/`.

### Maker-checker (strict by default)

New installs default to **strict** maker-checker: `proposal apply` requires status `ready_to_apply` (submit → validate → approve). Doctor prints the resolved mode (`STRICT` or `LEGACY`).

**Re-enable legacy apply** (pending/validated/approved without checker) if you need the old path:

```jsonc
// {projectDir}/project.json  (project wins over user config)
{
  "makerChecker": {
    "legacyApplyWithoutApprove": true
  }
}
```

Or pin in `~/.layerkit/config.json` under `makerChecker.legacyApplyWithoutApprove`. Doctor warns when legacy is on. Prefer the strict path for production.

Cheat sheet: [docs/CHEATSHEET.md](./docs/CHEATSHEET.md). Golden path: [docs/AGENT_GOLDEN_PATH.md](./docs/AGENT_GOLDEN_PATH.md).

---

## How it works

| Plane | Who | What |
|-------|-----|------|
| Research | **Your AI agent** | Reads vendor docs → map/processor proposals with `sources[]` |
| Gates | CLI | `proposal validate` / dry-run / apply, doctor, install |
| Runtime | Your app or Layerkit delivery | Deterministic map apply + HTTP — **no LLM on the hot path** |
| Generate | Agent + CLI | Integrate plan into production datalayer (`INTEGRATE.md` / `--module-root`) |
| Heal | Agent + CLI | Pin structured contract, diff drift, validate semantic rename decisions, edit production source/map files directly |

**No vendor catalog.** Project stores start with zero maps. Agents research any vendor from official docs and apply customer-owned proposals under `{projectDir}` (default `.layerkit`).

---

## Commands

```bash
layerkit install --platform codex|claude|cursor|copilot|opencode|openhands|factory-droid|antigravity \
  [--hooks enabled|disabled] [--auto-map-updates enabled|disabled] [--poc]
layerkit doctor
layerkit repo status
layerkit map list|show|validate
layerkit proposal validate <file>
layerkit proposal apply <file>
layerkit process dry-run --vendor <v> --intent <i>
layerkit generate --module-root <dir> [--vendor <id>] [--apply]
layerkit research fill --vendor <v> --openapi <file>
layerkit heal run --vendor <v> --openapi <file> --module-root <dir> [--rename-decisions <file>]
layerkit agent multi --vendor <id> [--mode heal] [--openapi <file>]
```

Docs-link-only heal is an AI-agent workflow, not CLI-only. The skill reads/cites vendor docs and writes a structured OpenAPI/contract file plus optional rename decisions; the CLI then deterministically validates and applies that structured input.

`generate` writes an integrate plan to `{projectDir}/out/INTEGRATE.md` for agents to edit **production code**. Requires production entrypoints or `--module-root`.

**Multi-agent:** `layerkit agent multi --vendor …` writes spawn prompts for parallel specialists (research / integrate / verify). Skill: `layerkit-multi-agent`.

---

## Project layout

```text
apps/cli/                 CLI entry
libs/install/platforms/   Multi-agent platform install
libs/vendor-memory/       Local maps + proposals
libs/proposal/            Validate gates (sources required)
libs/domain/              Sample commerce domain template (not a vendor catalog)
evals/harness/            Deterministic eval runner (merge bar)
evals/gates/              CI gates (suite ci → npm run eval:ci)
evals/map-quality-optimizer/
evals/vendor-research-plan/
skills/                   Agent skills
scripts/                  smoke:* and check-*
docs/                     Install prompt, launch guide
```

---

## Contributing

Layerkit is an **agent toolkit + eval harness**, not a community vendor-map catalog. Maps stay **customer-owned** under each project's store.

**Highest-value PRs:** skills, process evals/gates, platform installers, reliability, docs/UX.
See [CONTRIBUTING.md](./CONTRIBUTING.md).

**New here?** Start at [good first contributions map (#48)](https://github.com/hariharapanigrahy/layerkit/issues/48) or filter [`good first issue`](https://github.com/hariharapanigrahy/layerkit/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22). Reliability tracks (hallucination / timeout / transactions) are separate issues so multiple people can work in parallel.

1. Read [CONTRIBUTING.md](./CONTRIBUTING.md)
2. Claim a `help wanted` / `good first issue` (comment on the issue), or open a [feature](https://github.com/hariharapanigrahy/layerkit/issues/new?template=feature_request.yml) / [bug](https://github.com/hariharapanigrahy/layerkit/issues/new?template=bug_report.yml)
3. Optional: track **research notes** with the [vendor research template](https://github.com/hariharapanigrahy/layerkit/issues/new?template=vendor_map.yml) (examples/fixtures only — not official connectors)
4. PR with tests/evals and citations where knowledge is claimed

---

## Scripts & evals

```bash
npm test
npm run smoke:codex
npm run smoke:cursor
npm run eval:ci                 # merge bar — suite ci (required on every PR)
npm run eval:all                # release bar — ci + extras (e.g. vendor-research-plan)
npm run eval:proposal-sources   # single-case alias via eval harness
npm run eval:vendor-research-plan
```

| Script | Role |
|--------|------|
| `npm run eval:ci` | **Merge bar** — deterministic gates in `evals/suites.json#ci` |
| `npm run eval:all` | **Release bar** — `ci` + scale/quality extras under suite `all` |
| Nightly workflow | `.github/workflows/nightly.yml` runs `eval:all` on a schedule |

See [evals/README.md](./evals/README.md) for how to add a gate.

### Production checklist (brief)

Ship only when:

- [ ] `npm run eval:ci` green (PR + main)
- [ ] `npm run eval:all` green before release
- [ ] CI runs `eval:ci` on every PR (`.github/workflows/ci.yml`)
- [ ] Subsystems that ship behavior have a gate in `evals/gates/`
- [ ] No LLM on the production `track()` hot path

Smokes alone are **not** production-ready.

---

## License

MIT © Harihara Panigrahy and contributors

## Author

**Harihara Panigrahy** — hhp263@gmail.com
