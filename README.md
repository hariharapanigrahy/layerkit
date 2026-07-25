# Layerkit

[![CI](https://github.com/hariharapanigrahy/layerkit/actions/workflows/ci.yml/badge.svg)](https://github.com/hariharapanigrahy/layerkit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](./package.json)

### Agent-first multi-vendor data-layer toolkit (Java-first for enterprises)

Vendor field names, auth, and email/phone processing are **authored by coding agents** from **primary vendor documentation** — not hardcoded as fake universal truth. The package installs skills/hooks, stores proposals, and runs evals.

**Contributions welcome** — see [CONTRIBUTING.md](./CONTRIBUTING.md). Good first issues: fill empty vendor maps from official docs.

---

## Agent quick start

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
layerkit doctor
```

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

## Scripts

```bash
npm test
npm run smoke:codex
npm run smoke:cursor
npm run eval:ci                 # merge bar (deterministic gates)
npm run eval:all
npm run eval:proposal-sources   # legacy single-case aliases still work
npm run eval:vendor-research-plan
```

See [evals/README.md](./evals/README.md) for how to add a gate.

---

## License

MIT © Harihara Panigrahy and contributors

## Author

**Harihara Panigrahy** — hhp263@gmail.com
