# Layerkit

[![CI](https://github.com/hariharapanigrahy/layerkit/actions/workflows/ci.yml/badge.svg)](https://github.com/hariharapanigrahy/layerkit/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/layerkit.svg)](https://www.npmjs.com/package/layerkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](./package.json)

**Evidence-first AI agents that integrate and heal vendor APIs like a senior developer — production code, multi-lang surfaces, live PRs.**

When a vendor renames fields or a package needs a **new** vendor, freestyle agents pin `apiVersion`, invent maps, open store-only “done” PRs, or invent a parallel facade beside existing adapters. Layerkit makes the agent **read docs/OpenAPI/code**, **follow the client’s existing multi-vendor path** (registry + sibling adapters), **edit real production source** (not a sidecar SDK), **cover every language surface**, and **ship a real GitHub PR** — or an honest residual when there is nothing to change.

```text
docs / OpenAPI / curl / code
        ↓
  discover siblings → research → map → production source edits (all languages)
        ↓
  package verify → live PR  (or residual-no-pr break-glass)
```

Layerkit is **not** a runtime integration SDK and **not** a config-only installer. Skills + deterministic CLI rails force process; the **client package** remains the source of truth.

| Outcome | Freestyle agent | With Layerkit |
|--------|-----------------|---------------|
| Pin-only / SDK bump as “full integrate” | Common | Blocked — field edits or residual required |
| New vendor on multi-vendor package | Parallel facade / orphan tree | Follow sibling path + existing registry |
| Multi-lang package (node/python/ruby/…) | Often one language | Surfaces inventory; PR blocked until all `updated`\|`residual` |
| Handoff | Memory/store or fake PR URL | Live `pr:` URL (verified) or residual break-glass |
| Evidence | Optional | Fail-closed mark-done (docs URLs, production paths on disk under package root) |

## Quick start

```bash
npm install -g layerkit   # or: npx layerkit --help
# current release: see npm badge above (0.1.4+)

cd /path/to/your/client/package
layerkit install --platform claude   # or codex | cursor | copilot | …
layerkit doctor

# Intentional integrate / contract heal (user must opt in)
layerkit help
layerkit agent start --mode full --vendor <vendor>    # first integrate (default)
# layerkit agent start --mode heal --vendor <vendor>  # contract update when domain known
layerkit agent next          # skill packet — follow THAT skill only
# … evidence-backed research & production edits …
layerkit agent mark-done --step <id> --evidence <note.md>
layerkit pr open --title "…" --body "…" --pr-match "integrate <vendor>"
layerkit handoff write --vendor <vendor> --goal "…" --quality "package_verify: green"
```

**User opt-in examples:** `layerkit: full integrate acme`, `/layerkit heal stripe`, `@layerkit contract update`.

**Platforms:** `codex` · `claude` · `cursor` · `copilot` · `opencode` · `openhands` · `devin` · `windsurf` · `factory-droid` · `antigravity`

## What you get

| Area | Purpose |
|------|---------|
| **Skills** | Research, map, design (incl. multi-vendor sibling path), production source edit, privacy, handoff |
| **Pipeline** | `discover → surfaces → research → design → author → privacy → deletion-first → source-edit → handoff` |
| **CLI rails** | Fail-closed `agent next` / `mark-done`, surface inventory, package verify, PR open/reuse |
| **Evals** | CI gates + continuous skill-train (pin-only, invent fields, store-only, multi-vendor full integrate) |
| **Project store** | Local evidence, maps, proposals, memory under `.layerkit` (session workspace — not the product) |

Semantic mapping, renames, and source edits are **agent** work (docs + code). The CLI validates structure, order, evidence, surfaces, and live PR existence — it does not invent vendor fields or replace your production datalayer.

## Modes: full vs heal

| Mode | Use when | Discover |
|------|----------|----------|
| **`full`** (default) | First integrate of a vendor into the client package | Runs — domain + multi-vendor sibling inventory |
| **`heal`** | Vendor contract drift; domain already known | Skipped; surfaces still required |

**Full integrate on multi-vendor packages:** inventory sibling adapters/registries/tests → research the new vendor from docs → design by **following the existing path** (same module root + registry wire) → production adapter + clone sibling tests → package verify → live PR. Parallel facades and pin-only bumps are fail-closed.

Master skill: `layerkit-orchestrate-integration`.

```text
discover → surfaces → research → design → author → privacy → deletion-first → source-edit → handoff
```

**Contract heal:** human/docs/OpenAPI → agent cites evidence → edits existing mappers/adapters/tests → `layerkit pr open` (or residual). Prefer **updating** existing code; deletion-first before additive work.

Deletion-first is mandatory:

- Before adding code, identify existing code/docs/tests that can be removed or rewritten.
- Prefer modifying or deleting existing code over adding files.
- Do not add an abstraction until the existing abstraction is proven insufficient.
- For every new file/function/export, list what it replaces. If it replaces nothing, justify why it must exist.
- Target net-negative or near-neutral LOC unless functionality truly expands.

## Commands

```bash
layerkit install --platform codex|claude|cursor|copilot|opencode|openhands|devin|windsurf|factory-droid|antigravity \
  [--hooks enabled|disabled] [--map-reminders enabled|disabled] [--poc] [--user-config]
layerkit doctor
layerkit repo status
layerkit help
layerkit cheatsheet

layerkit agent start --mode full|heal --vendor <v> [--force-reset]
layerkit agent status
layerkit agent next
layerkit agent mark-done --step discover|surfaces|research|design|author|privacy|deletion-first|source-edit|handoff --evidence <path>

layerkit pr open --title "…" --body "…" [--pr-match "…"] [--no-reuse]
layerkit handoff write --vendor <v> --goal "…" [--done …] [--next …] [--blocked …] [--quality "package_verify: green"]

layerkit map list
layerkit map show <vendor>
layerkit map validate <file>

layerkit proposal write map --vendor <v> --out ./map.json --source title=url … --field domain:vendor …
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

**Production paths** listed in source-edit evidence are resolved against the **customer package root** (git/repo root), not the `.layerkit` store — so `src/vendors/…` paths must exist on disk under the package.

Client projects usually should not commit `.layerkit/maps` unless the team intentionally wants reviewed map artifacts in source control. Production source edits and tests belong in the client package itself.

## Package Layout

```text
apps/cli/                 CLI entry
libs/install/             Platform install support
libs/vendor-memory/       Local maps, proposals, sessions, memory
libs/proposal/            Proposal scaffold and validation
libs/hallucination/       Evidence and hallucination guardrails
libs/agent/               Pipeline, skill packets, surfaces, PR open, handoff
libs/domain/              Shared schema/types for proposals and maps
evals/                    CI gates, skill-train curriculum, fixtures
skills/                   Agent skills shipped in the package
docs/                     Agent/operator docs
```

## Validate / develop

```bash
npm run build
npm run eval:ci          # merge bar
npm run eval:skill-train # skill-text + agent-run judges
npm run pack:check
```

See [docs/CHEATSHEET.md](./docs/CHEATSHEET.md) and [docs/AGENT_GOLDEN_PATH.md](./docs/AGENT_GOLDEN_PATH.md) for the operator flow. See [MATURITY.md](./MATURITY.md), [SECURITY.md](./SECURITY.md), and [docs/API_STABILITY.md](./docs/API_STABILITY.md) for release expectations. Contributing: [CONTRIBUTING.md](./CONTRIBUTING.md).

## Release notes (0.1.4)

- Multi-vendor **full integrate** training: skills + skill-train scenarios for “follow sibling path / no parallel facade”
- Source-edit mark-done resolves production paths against **package root** (fixes false `source_edit_paths_not_on_disk` when files live under `src/`)
- README aligned with intentional entry, full vs heal, surfaces, PR/handoff rails
