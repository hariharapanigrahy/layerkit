# Architecture (greplica-shaped)

Standalone repo: https://github.com/hariharapanigrahy/layerkit

```text
apps/cli              CLI entry (install, proposal, doctor, generate, hooks)
libs/
  install/platforms   codex | claude | cursor | copilot | opencode | openhands | factory-droid | antigravity
  hooks               session guidance injection
  vendor-memory       local map/proposal store (graph analog)
  proposal            validate/apply gates
  domain              commerce intents + empty vendor slots
  generate            Java scaffold only
  config              ~/.layerkit/config.json
  agent-runner        (extension point for offline eval agent runs)
evals/
  cases/*             rubrics + run.ts gates
  map-quality-optimizer   coverage scoring (ranking-optimizer analog)
  vendor-research-plan    held-out research prompts (swechat-plan analog)
skills/               what coding agents execute
scripts/              smoke:* + check-* (CI)
```

Agents author knowledge. Infrastructure installs, gates, stores, and evals.
