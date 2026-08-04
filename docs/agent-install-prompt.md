# Agent Install Prompt

Paste into your coding agent:

````txt
Install Layerkit (AI-agent workbench for client-owned vendor integration source edits).

Repo: https://github.com/hariharapanigrahy/layerkit

Cheat sheet (one page): docs/CHEATSHEET.md — or run: layerkit cheatsheet
Day-1 path: docs/AGENT_GOLDEN_PATH.md
Master skill only after install: skills/layerkit-orchestrate-integration/SKILL.md

Before installing, ask:

Question 0 — Agent platform?
1. Codex  2. Claude Code  3. Cursor  4. GitHub Copilot CLI
5. OpenCode  6. OpenHands  7. Factory Droid  8. Antigravity

Question 1 — Guidance mode?
1. Hooks + auto-map-updates reminders (Recommended)
2. Hooks only
3. No hooks

Question 2 — Seed empty project store (POC layout)?
1. Yes (Recommended)
2. No

Map Q1:
- 1 → --hooks enabled --auto-map-updates enabled
- 2 → --hooks enabled --auto-map-updates disabled
- 3 → --hooks disabled --auto-map-updates disabled

```bash
git clone https://github.com/hariharapanigrahy/layerkit.git
cd layerkit && npm install && npm run build && npm link
cd <target-app-repo>
layerkit install --platform <platform> <hook flags> --poc
layerkit doctor
layerkit agent status
layerkit agent next
```

Supported platforms: codex|claude|cursor|copilot|opencode|openhands|factory-droid|antigravity

Do not invent vendor field maps during install.
Do not research or author maps until install + doctor are green.

Next (and only next): follow docs/AGENT_GOLDEN_PATH.md under skill
layerkit-orchestrate-integration (agent status/next -> research -> design ->
author -> privacy -> deletion-first -> source-edit -> handoff).

Final answer: platform, hooks mode, projectDir, doctor status, and that the
next step is the golden path + orchestrate skill (not ad-hoc map authoring).
````