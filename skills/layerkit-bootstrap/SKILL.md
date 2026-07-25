---
name: layerkit-bootstrap
description: Install Layerkit into the current repo; seed project store + memory; run doctor.
---

# layerkit-bootstrap

Install tools for the **agent-as-developer** loop. Maps start empty; agents author integrations from evidence.

## Steps

1. Detect platform: `codex | claude | cursor | copilot | opencode | openhands | factory-droid | antigravity`
2. Install + verify:

```bash
layerkit install --platform <platform> --hooks enabled --auto-map-updates enabled --poc
layerkit doctor
layerkit repo status
layerkit memory index
```

3. Confirm project store path (`--project-dir` / `LAYERKIT_PROJECT_DIR` / default `.layerkit`).
4. Confirm memory dirs under `{projectDir}/memory/` (INDEX.md present).
6. Next: `layerkit-orchestrate-integration` (or `layerkit-discover-data-layer`).

## Forbidden

- Authoring vendor maps during bootstrap
- Hardcoding vendor field names into core

## Success criteria

- [ ] `layerkit doctor` exits clean (or only expected empty-map warnings)
- [ ] Skills installed for the chosen platform
- [ ] `{projectDir}/memory/INDEX.md` exists
- [ ] No invented map payloads in store

## Final answer

Platform, projectDir, hooks on/off, doctor status, next skill.
