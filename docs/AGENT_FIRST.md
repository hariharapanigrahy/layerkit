# Architecture

Standalone repo: https://github.com/hariharapanigrahy/layerkit

```text
apps/cli              CLI entry (install, proposal, doctor, generate, hooks)
libs/
  install/platforms   codex | claude | cursor | copilot | opencode | openhands | factory-droid | antigravity
  hooks               session guidance injection
  vendor-memory       local map/proposal store
  proposal            validate/apply gates
  domain              sample commerce domain template (not a vendor catalog)
  generate            Production integrate plan (INTEGRATE.md)
  config              ~/.layerkit/config.json
evals/
  gates/*             deterministic CI gates
  map-quality-optimizer   map coverage scoring
  vendor-research-plan    held-out research prompts + judge criteria
skills/               what coding agents execute
scripts/              smoke:* + check-* (CI)
```

Agents author knowledge. Infrastructure installs, gates, stores, and evals.
