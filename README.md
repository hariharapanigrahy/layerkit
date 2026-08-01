# Layerkit

[![CI](https://github.com/hariharapanigrahy/layerkit/actions/workflows/ci.yml/badge.svg)](https://github.com/hariharapanigrahy/layerkit/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/layerkit.svg)](https://www.npmjs.com/package/layerkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](./package.json)

Layerkit is an **AI-agent workbench for vendor integrations**. It installs skills, keeps local evidence/proposals/memory, and runs evals that teach agents to update a client package like a developer.

Layerkit is **not** a runtime SDK that clients import to route or send vendor traffic. The final integration code belongs in the client package: existing mappers, adapters, datalayer interfaces, tests, and docs are edited directly by the agent from cited evidence.

## Install

```bash
npm install -g layerkit
# or
npx layerkit --help
```

```bash
cd /path/to/client/package
layerkit install --platform codex --hooks enabled --map-reminders enabled
layerkit doctor
```

Supported platforms:

```text
codex | claude | cursor | copilot | opencode | openhands | devin | windsurf | factory-droid | antigravity
```

## What Layerkit Provides

| Area | Purpose |
|------|---------|
| Skills | Agent instructions for research, mapping, source edits, privacy review, handoff, and checker assist |
| Project store | Local `.layerkit` evidence, maps, proposals, memory, and sessions |
| CLI rails | Deterministic tools for install, doctor, proposal validation, map validation, memory, and agent step state |
| Evals | CI gates and skill judges that check agent behavior, evidence discipline, and package hygiene |

The CLI does not infer vendor semantics, rewrite source code, generate PR metadata, route live traffic, or perform semantic field renames. Those are agent responsibilities because they require reading docs and code in context.

## Agent Workflow

Use the master skill `layerkit-orchestrate-integration`.

```text
discover -> research -> design -> author -> privacy -> deletion-first -> source-edit -> handoff
```

For a contract heal, the agent starts from vendor docs/OpenAPI/change notes, compares them with the current client integration, and edits the client package directly. Existing fields are updated in place. Removed or unsupported fields become explicit TODOs only when the client interface or datalayer cannot support the new vendor contract.

Deletion-first is mandatory:

- Before adding code, identify existing code/docs/tests that can be removed or rewritten.
- Prefer modifying or deleting existing code over adding files.
- Do not add an abstraction until the existing abstraction is proven insufficient.
- For every new file/function/export, list what it replaces. If it replaces nothing, justify why it must exist.
- Target net-negative or near-neutral LOC unless functionality truly expands.

## Useful Commands

```bash
layerkit install --platform codex|claude|cursor|copilot|opencode|openhands|devin|windsurf|factory-droid|antigravity \
  [--hooks enabled|disabled] [--map-reminders enabled|disabled] [--poc] [--user-config]
layerkit doctor
layerkit repo status

layerkit agent status
layerkit agent next
layerkit agent mark-done --step discover|research|design|author|privacy|deletion-first|source-edit|handoff --evidence <path>

layerkit map list
layerkit map show <vendor>
layerkit map validate <file>

layerkit proposal validate <file>   # read-only structural check
layerkit proposal submit <file>
layerkit proposal approve <id>
layerkit proposal apply <file-or-id>

layerkit memory list
layerkit memory search "<query>"
layerkit memory show <id>
layerkit memory append --type research --title "<title>" --body-file <file>
```

## Project Store

Layerkit stores agent working state under a project directory, defaulting to `.layerkit`.

Resolution order:

| Priority | Source |
|----------|--------|
| 1 | CLI `--project-dir <path>` |
| 2 | Env `LAYERKIT_PROJECT_DIR` |
| 3 | Repo pointer `layerkit.path.json` / `layerkit.json` |
| 4 | Default `{repo}/.layerkit` |

Client projects usually should not commit `.layerkit/maps` unless the team intentionally wants reviewed map artifacts in source control. Production source edits and tests belong in the client package itself.

## Package Layout

```text
apps/cli/                 CLI entry
libs/install/             Platform install support
libs/vendor-memory/       Local maps, proposals, sessions, memory
libs/proposal/            Proposal scaffold and validation
libs/hallucination/      Evidence and hallucination guardrails
libs/agent/               Pipeline state and handoff helpers
libs/domain/              Shared schema/types for proposals and maps
evals/                    CI gates and skill judges
skills/                   Agent skills shipped in the package
docs/                     Agent/operator docs
```

## Validate

```bash
npm run build
npm run eval:ci
npm run pack:check
```

See [docs/CHEATSHEET.md](./docs/CHEATSHEET.md) and [docs/AGENT_GOLDEN_PATH.md](./docs/AGENT_GOLDEN_PATH.md) for the operator flow. See [MATURITY.md](./MATURITY.md), [SECURITY.md](./SECURITY.md), and [docs/API_STABILITY.md](./docs/API_STABILITY.md) for release expectations.
