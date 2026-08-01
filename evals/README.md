# Layerkit evals (production merge bar)

**Production readiness is defined by a green deterministic eval system**, not demos alone.

| Script | Purpose |
|--------|---------|
| `npm run eval:ci` | Merge bar — suite `ci` in `suites.json` (required on every PR) |
| `npm run eval:all` | Release bar — full `ci` list plus extras (e.g. `vendor-research-plan` scale) |
| `npm run eval:<legacy>` | Single-case aliases (stable; re-export gates) |
| Nightly | `.github/workflows/nightly.yml` schedules `npm run eval:all` + agent transcript judge |
| `npm run eval:agent-judge` | **Nightly only** — deterministic transcript/process rubric (not merge bar; not in `eval:ci`) |

```bash
npm run build
npm run eval:ci
# or:
node dist/evals/harness/runner.js --suite ci
node dist/evals/harness/runner.js --case proposal-sources-required
node dist/evals/harness/runner.js --list
node dist/evals/harness/runner.js --suite ci --json   # JSON on stdout; logs on stderr
```

**Empty suites:** `ci` / `all` with zero cases exit 1 (fail closed). Suite `nightly` may be empty (exit 0 + warning).

**Agent transcript judge (nightly only):** `evals/agent-judge/` scores recorded fixture transcripts (`evals/fixtures/agent/sample-transcript*.json`) for citations present, no invent markers, and deepen-before-human. Run via `npm run eval:agent-judge`. **Not** part of `eval:ci` / merge bar.

**Skill judge coverage:** `evals/fixtures/skills/skill-judge-coverage.json` maps every `skills/layerkit-*/SKILL.md` to judged dimensions and CI gate ids. Gate `skill-judge-coverage` fails when a skill is missing coverage, points at a missing gate, or points at a gate outside `suite ci`.

**Timeouts:** each gate defaults to 60s; override with `EVAL_GATE_TIMEOUT_MS`.

## Layout

```text
evals/
  harness/          # runner, assert, temp-project, load-fixture, types
  fixtures/         # normative JSON/YAML/MD for gates (grow with features)
  gates/<case-id>/  # deterministic CI cases
    case.json       # metadata: suite, owners, tags
    run.ts          # executable gate (PASS/FAIL, exit 1 on fail)
  agent-judge/      # nightly transcript/process rubric (not merge bar)
  suites.json       # suite → case id lists
  cases/            # legacy thin re-exports (npm script aliases)
  lib/common.ts     # re-exports harness assert
```

## How to add a gate

1. **Create** `evals/gates/<case-id>/` with:
   - `case.json` — `id`, `suite` (`ci` for merge bar), `title`, `owners`, `tags`
   - `run.ts` — deterministic checks only (no network, no LLM keys)
2. **Register** the id in `evals/suites.json` under `ci` (and `all` if release-relevant).
3. **If it judges skill behavior**, add it to `evals/fixtures/skills/skill-judge-coverage.json` under the covered skill and dimension.
4. **Use harness helpers**:
   - `assertTrue` / `assertEqual` / `fail` from `evals/harness/assert.js`
   - `withTempProject` from `evals/harness/temp-project.js` for store isolation
   - `loadFixture` / `loadFixtureText` from `evals/harness/load-fixture.js` for `evals/fixtures/**`
5. **Keep the gate under ~5s** (except install / java-ref).
6. **Land the gate in the same PR** as the feature it protects (eval-with-feature).
7. Verify: `npm run build && npm run eval:ci`

### Minimal `run.ts` template

```typescript
import { assertTrue } from '../../harness/assert.js';
// import { withTempProject } from '../../harness/temp-project.js';
// import { loadFixture } from '../../harness/load-fixture.js';

assertTrue('example holds', true);
console.log('my-gate: all checks passed');
```

### `case.json` template

```json
{
  "id": "my-gate",
  "suite": "ci",
  "title": "Short description of what must hold",
  "owners": ["subsystem"],
  "featurePr": "PRn",
  "fixtures": [],
  "tags": ["deterministic", "no-network"]
}
```

## Rules

1. **Deterministic first** — fixed timestamps/fixtures; no flaky clocks.
2. **Fail closed** — missing fixture or bad assertion → exit 1.
3. **Gates are the merge bar** — `eval:ci` must stay green on `main`.
4. **Agent / LLM judges** are nightly only (`evals/agent-judge/`, `npm run eval:agent-judge`) — never add them to suite `ci` / merge bar.

## Current CI suite (G0)

| Id | Asserts |
|----|---------|
| `proposal-sources-required` | empty `sources[]` → error `sources` |
| `hallucination-block-apply` | unsupported or unsourced proposal content is blocked |
| `deletion-first-skill` | source-edit skills require deletion-first behavior |
| `skill-hybrid-heal-judge` | heal skills reject deterministic source editing and require real package edits |
| `skill-judge-coverage` | shipped skills have judge coverage |
| `install-platforms` | 10 platforms registered with installers |
