# Layerkit Maturity

Layerkit is production-oriented for agent workflow rails and experimental for agent-authored integration quality.

## Stable

- installing Layerkit skills into supported coding agents
- `.layerkit` project-store layout
- map/proposal structural validation
- memory append/list/search/index with redaction
- `doctor` checks for package/project hygiene issues
- CI eval gates under `evals/gates`

## Agent-Owned

These are intentionally skill-driven because deterministic code cannot solve them reliably for every customer package:

- reading vendor API docs that are not OpenAPI
- deciding whether a vendor field was renamed or is genuinely new
- editing client-owned mappers, adapters, tests, and privacy code
- validating semantic mapping choices against business context

## Experimental

- hook-based prompt reminders
- platform-specific installer details for newer agent IDEs
- richer QA corpus coverage for multi-language package examples

Every release should keep deterministic code limited to exact rails and move semantic integration behavior into skills plus judges.
