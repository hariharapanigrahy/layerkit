# Layerkit Cheat Sheet

Layerkit is agent tooling for changing a client package. It is not the runtime integration layer.

## Install / Doctor

```bash
npm i -g layerkit
layerkit install --platform codex|claude|cursor|copilot|opencode|openhands|devin|windsurf|factory-droid|antigravity \
  --hooks enabled
layerkit doctor
```

Store resolution: `--project-dir` -> `LAYERKIT_PROJECT_DIR` -> `layerkit.path.json` -> `.layerkit`.

## Intentional entry (integrate / heal only)

Rails apply when the user opts in — not for unrelated coding.

```bash
# User message examples:
#   layerkit: heal stripe to latest API
#   /layerkit integrate vendor X

layerkit help                 # BMAD-style: when rails apply + how to start
layerkit agent help
layerkit agent start [--mode full|heal] [--vendor <v>] [--note <text>]   # default: full
layerkit agent next           # writes skill packet; follow that skill only
layerkit agent mark-done --step discover|research|design|author|privacy|deletion-first|source-edit|handoff --evidence <path>
layerkit agent status
```

Order:

```text
discover -> research -> design -> author -> privacy -> deletion-first -> source-edit -> handoff
```

Heal uses the same pipeline. Start it with `layerkit agent start --mode heal --vendor <v>` so discover is treated as already known. The agent reads the updated vendor docs/OpenAPI, identifies drift from evidence, and edits production package files directly.

## Deterministic CLI Rails

```bash
layerkit repo status
layerkit map list
layerkit map show <vendor>
layerkit map validate <file>
layerkit proposal validate <file>   # read-only structural check
layerkit proposal submit <file>
layerkit proposal approve <id>
layerkit proposal apply <file-or-id>
layerkit memory list
layerkit memory search "<query>"
layerkit memory append --type research --title "<title>" --body-file <file>
```

These commands validate explicit artifacts and project health. They do not infer semantic mappings, generate production source, or route vendor traffic.

## Deletion-First Rule

- Before adding code, identify existing code/docs/tests that can be removed or rewritten.
- Prefer modifying or deleting existing code over adding files.
- Do not add a new abstraction until existing code cannot be changed.
- For every new file/function/export, list what it replaces.
- Keep LOC net-negative or near-neutral unless functionality truly expands.

## Skills

| Role | Skill |
|------|-------|
| Lead | `layerkit-orchestrate-integration` |
| Multi-agent coordination | `layerkit-multi-agent` |
| Discover customer code | `layerkit-discover-data-layer` |
| Research vendor evidence | `layerkit-research-vendor` |
| Author/update maps | `layerkit-author-map` |
| Transform/helper code | `layerkit-author-processor` |
| Source edits | `layerkit-source-edit-client` |
| Privacy review | `layerkit-privacy-review` |
| Checker assist | `layerkit-checker-assist` |
| Handoff | `layerkit-session-handoff` |

## Forbidden

- Invent vendor fields/endpoints without docs/OpenAPI/curl/code evidence.
- Use `.layerkit/out` as production code.
- Generate PR metadata instead of editing the client package.
- Self-approve in strict maker-checker mode.
- Add wrappers or abstractions when existing code can be updated.
