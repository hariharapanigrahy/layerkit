# Layerkit evals (production merge bar)

**Production readiness is defined by a green deterministic eval system**, not demos alone.

| Script | Purpose |
|--------|---------|
| `npm run eval:ci` | Merge bar — suite `ci` in `suites.json` (required on every PR) |
| `npm run eval:all` | Release bar — full `ci` list plus extras (e.g. `vendor-research-plan` scale) |
| `npm run eval:skill-train` | Continuous skill training — skill-text + agent-run judges on scenario curriculum |
| `npm run eval:skill-train:loop` | Same via gate `skill-train-loop` (in suite `ci`) |
| `npm run eval:agent-judge` | Alias → skill-train loop |
| `npm run eval:<legacy>` | Single-case aliases (stable; re-export gates) |
| Nightly | `.github/workflows/nightly.yml` schedules `npm run eval:all` + skill-train |

```bash
npm run build
npm run eval:ci
npm run eval:skill-train
# or:
node dist/evals/harness/runner.js --suite ci
node dist/evals/harness/runner.js --case proposal-sources-required
node dist/evals/harness/runner.js --case skill-train-loop
node dist/evals/harness/runner.js --list
node dist/evals/harness/runner.js --suite ci --json   # JSON on stdout; logs on stderr
```

**Empty suites:** `ci` / `all` with zero cases exit 1 (fail closed). Suite `nightly` may be empty (exit 0 + warning).

**Skill judge coverage:** `evals/fixtures/skills/skill-judge-coverage.json` maps every `skills/layerkit-*/SKILL.md` to judged dimensions and CI gate ids. Gate `skill-judge-coverage` fails when a skill is missing coverage, points at a missing gate, or points at a gate outside `suite ci`.

**Timeouts:** each gate defaults to 60s; override with `EVAL_GATE_TIMEOUT_MS`.

## Continuous skill training

Curriculum: `evals/fixtures/skill-scenarios/*.json` (compact form).

Scenarios use **synthetic vendors** (`acme`, `docs.example.com`, example PR URLs). They do **not** call vendor docs or APIs — offline judges on local `SKILL.md` + canned transcripts. Do not name scenarios after real vendor release codenames.

**Compact fixtures (deduped):** each scenario stores skill-text gold + run deltas only. The loader expands a shared pipeline template (`runGold.requiredPipelineSteps`) via `evals/skill-train/expand.ts`. Prefer:

- `artifactsPreset`: `good-pr` | `store-only` | `store-only-map` | `residual-no-pr` | `pin-only-pr`
- `stepOverrides`: e.g. `{ "author": { "invent": true } }`
- `prepend` / `append`: extra steps (e.g. ask-human)
- `steps`: absolute partial pipeline (incomplete bad runs)
- Legacy full `transcript` still loads if present

```text
scenario → skill-text judge (SKILL.md) → agent-run judge (L0 runs) → PASS/FAIL
         → on FAIL: fix skills/rails/fixtures → re-run
```

| Layer | What |
|-------|------|
| **A Scenarios** | User intent + gold + compact L0 good/bad run deltas |
| **B1 Skill-text** | Does SKILL.md instruct correct behavior? |
| **B2 Agent-run** | Did the run meet gold (process, specs, routing, mapper, terminal, pipeline)? |
| **C L0 runs** | Expanded from template + deltas (or legacy full transcript) |
| **D Loop** | `evals/skill-train/loop.ts` — all scenarios must go green |

Agents do not load scenarios at runtime. Training improves skills and rails; runtime uses skills + mark-done rails.

## Layout

```text
evals/
  harness/                 # runner, assert, temp-project, load-fixture, types
  fixtures/                # normative JSON/YAML/MD for gates
  fixtures/skill-scenarios/  # skill-train curriculum
  gates/<case-id>/         # deterministic CI cases
    case.json
    run.ts
  skill-train/             # continuous train loop
  agent-judge/             # thin alias → skill-train
  suites.json              # suite → case id lists
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

### How to add a skill-train scenario

1. Add `evals/fixtures/skill-scenarios/<id>.json` with `skillText`, `runGold`, and ≥1 good + ≥1 bad L0 run.
2. Run `npm run eval:skill-train` until green (fix skills/rails/fixtures as needed).
3. Gate `skill-train-loop` is already in suite `ci`.

### Multi-vendor / new-vendor full integrate (client packages)

Train **process** on multi-vendor brownfield patterns — not package-name catalogs. Curriculum uses synthetic vendors (`northstar`, `cedar`, `acme`) and offline judges.

Real-world patterns that motivated the scenarios (examples only; not shipped product truth):

- Multi-provider payment packages (sibling adapters + shared registry/router)
- Multi-destination analytics packages (extend existing destination module)
- Issues/PRs asking to “add a provider/integration” by copying an existing path

| Scenario | Trains |
|----------|--------|
| `tdd-full-e2e-new-vendor-follow-existing-path` | Full pipeline: discover siblings → research → design on existing path → production adapter+registry+tests → PR; reject parallel facade / store-only / invent |
| `tdd-multi-vendor-no-parallel-facade` | Extend existing registry beside siblings; reject side registry and pin-only |

Source-edit case fixtures under `evals/fixtures/skills/source-edit-cases.json` (`new-vendor-*`) lock the same behaviors for the `source-edit-skill-cases` gate.

Do **not** expand training by listing real GitHub package names in `libs/` or scenarios — abstract the path, keep synthetic vendors, and fix skills until judges go green.

## Rules

1. **Deterministic first** — fixed timestamps/fixtures; no flaky clocks; no live LLM required for merge bar.
2. **Fail closed** — missing fixture, missing scenario, or failed assertion → exit 1.
3. **Gates are the merge bar** — `eval:ci` must stay green on `main`.
4. **Prefer modifying** existing scenarios, skills, and gates over freestyle catalogs.

## Current CI suite (rails + skill train)

Full list is `evals/suites.json` → `ci`. Representative gates:

| Id | Asserts |
|----|---------|
| `proposal-sources-required` | empty `sources[]` → error `sources` |
| `hallucination-block-apply` | unsupported or unsourced proposal content is blocked |
| `deletion-first-skill` | source-edit skills require deletion-first behavior |
| `skill-hybrid-heal-judge` | heal skills reject deterministic source editing and require real package edits |
| `skill-judge-coverage` | shipped skills have judge coverage |
| `install-platforms` | 10 platforms registered with installers |
| `agent-skill-packet` | session + packet + evidence + handoff terminal rails |
| `skill-train-loop` | continuous skill-text + agent-run curriculum green |

Run `node dist/evals/harness/runner.js --list` for the full inventory.
