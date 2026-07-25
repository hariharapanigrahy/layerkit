# Layerkit

[![CI](https://github.com/hariharapanigrahy/layerkit/actions/workflows/ci.yml/badge.svg)](https://github.com/hariharapanigrahy/layerkit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](./package.json)

### Agent toolkit: AI agents that build vendor integrations **like developers**

Layerkit does **not** ship or maintain a vendor catalog. Agents research **any** vendor from docs/OpenAPI/curl, author customer-owned maps/processors/flows, pass evals + maker-checker, and generate client code — then runtime `track()` stays deterministic (no LLM on the hot path).

**Contributions welcome** — see [CONTRIBUTING.md](./CONTRIBUTING.md). Best contributions: **skills** and **process evals**, not pre-built vendor maps.

---

## Agent quick start

**Day-1 any-vendor path:** [docs/AGENT_GOLDEN_PATH.md](./docs/AGENT_GOLDEN_PATH.md) (orchestrate + CLI only).

Paste into your coding agent:

```txt
Install Layerkit for this repo using https://raw.githubusercontent.com/hariharapanigrahy/layerkit/main/docs/agent-install-prompt.md
```

Manual:

```bash
git clone https://github.com/hariharapanigrahy/layerkit.git
cd layerkit
npm install && npm run build && npm link

cd /path/to/your/app
layerkit install --platform codex --hooks enabled --auto-map-updates enabled --poc
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

Agent golden path: [docs/AGENT_GOLDEN_PATH.md](./docs/AGENT_GOLDEN_PATH.md).

---

## How it works

| Plane | Who | What |
|-------|-----|------|
| Research | **Your AI agent** | Reads vendor docs → map/processor proposals with `sources[]` |
| Gates | CLI | `proposal validate` / `apply`, doctor, install |
| Ship | Agent + scaffold | Java client for enterprises (`generate --lang java` + skill) |
| Runtime | Your JVM | Deterministic `track()` — **no LLM on the hot path** |

20 commerce vendor **slots** ship empty (doc URLs only). Community + agents fill them.

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
layerkit generate --lang java
```

---

## Project layout

```text
apps/cli/                 CLI entry
libs/install/platforms/   Multi-agent platform install
libs/vendor-memory/       Local maps + proposals
libs/proposal/            Validate gates (sources required)
libs/domain/              Commerce intents, empty vendor slots
evals/harness/            Deterministic eval runner (merge bar)
evals/gates/              CI gates (suite ci → npm run eval:ci)
evals/cases/              Legacy thin re-exports of gates
evals/map-quality-optimizer/
evals/vendor-research-plan/
skills/                   Agent skills
scripts/                  smoke:* and check-*
docs/                     Install prompt, launch guide
```

---

## Contributing

We want this to be a **community map library + agent toolkit**:

1. Read [CONTRIBUTING.md](./CONTRIBUTING.md)
2. Open a [vendor map issue](https://github.com/hariharapanigrahy/layerkit/issues/new?template=vendor_map.yml) or grab `help wanted`
3. Research docs with skill `layerkit-research-vendor`
4. PR with citations

Maintainer launch checklist: [docs/OPEN_SOURCE_LAUNCH.md](./docs/OPEN_SOURCE_LAUNCH.md)

---

## Scripts & evals

```bash
npm test
npm run smoke:codex
npm run smoke:cursor
npm run eval:ci                 # merge bar — suite ci (required on every PR)
npm run eval:all                # release bar — ci + extras (e.g. vendor-research-plan)
npm run eval:proposal-sources   # legacy single-case aliases still work
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
