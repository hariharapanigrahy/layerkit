# Agent Install Prompt

Paste into your coding agent:

````txt
Install Layerkit (agent-first multi-vendor data-layer toolkit).

Repo: https://github.com/hariharapanigrahy/layerkit

Before installing, ask:

Question 0 — Agent platform?
1. Codex  2. Claude Code  3. Cursor  4. GitHub Copilot CLI
5. OpenCode  6. OpenHands  7. Factory Droid  8. Antigravity

Question 1 — Guidance mode?
1. Hooks + map-update reminders (Recommended)
2. Hooks only
3. No hooks

Question 2 — Seed 20-vendor empty commerce POC?
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
```

Do not invent vendor field maps during install.
Next: skill layerkit-research-vendor for a priority vendor.

Final answer: platform, hooks mode, vendor slot count, next research step.
````
