# Architecture

Standalone repo: https://github.com/hariharapanigrahy/layerkit

```text
apps/cli              CLI entry (install, proposal, map, memory, doctor, agent state)
libs/
  install             coding-agent platform installers
  hooks               short session guidance injection
  vendor-memory       local project store for maps/proposals/sessions/memory
  proposal            scaffold and validation for explicit artifacts
  hallucination       fail-closed placeholder/invention checks before apply
  agent               checklist, pipeline state, handoff helpers
  memory              markdown memory stack
  doctor              deterministic project health and secret scan
  config              project-dir and user config resolution
evals/
  gates/*             deterministic CI gates and skill judges
  vendor-research-plan    held-out research prompts + judge criteria
skills/               agent workflows that perform semantic integration work
scripts/              smoke:* + package checks
```

Layerkit installs skills, stores evidence, validates explicit artifacts, and judges agent behavior. The agent edits the client package directly; Layerkit is not the runtime vendor integration layer.
