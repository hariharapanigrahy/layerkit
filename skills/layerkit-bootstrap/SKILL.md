---
name: layerkit-bootstrap
description: Install Layerkit into the current repo for the active agent platform and seed empty 20-vendor memory.
---

# layerkit-bootstrap

## Steps

1. Detect platform: codex | claude | cursor | copilot | opencode | openhands | factory-droid | antigravity
2. ```bash
   layerkit install --platform <platform> --hooks enabled --auto-map-updates enabled --poc
   layerkit doctor
   layerkit repo status
   ```
3. Confirm 20 skeleton vendors (empty maps + doc URLs).
4. Do **not** invent field maps. Next skill: `layerkit-research-vendor`.

## Final answer

Platform, vendor slot count, hooks on/off, next vendor to research.
