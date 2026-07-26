# Contributing to Layerkit

Thanks for helping build an **agent-first multi-vendor data-layer toolkit**.

Layerkit does **not** maintain a vendor integration catalog. Product value is **skills + process evals + deterministic runtime** so an agent can integrate *any* vendor into a **customer-owned** project store. See [docs/designs/agent-as-developer-no-catalog.md](./docs/designs/agent-as-developer-no-catalog.md).

## Code of conduct

Be respectful. See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## Ways to contribute (priority order)

| Priority | Contribution | Where | Notes |
|----------|--------------|--------|--------|
| 1 | **Agent skills** | `skills/layerkit-*/SKILL.md` | Orchestration, research, author, privacy, handoff — improve agent process |
| 1 | **Process evals / gates** | `evals/gates/<name>/` + `evals/suites.json` | Evidence-first, no-invent, citation, CLI behavior — merge bar is `npm run eval:ci` |
| 1 | **Agent platform install** | `libs/install/platforms/` + `scripts/smoke-*.mjs` | Codex, Claude, Cursor, Copilot, OpenCode, OpenHands, … |
| 2 | **Docs / first-hour UX** | `README.md`, `docs/`, install prompts | Clear agent + human paths help adoption |
| 2 | **Generic processors** | `libs/strategy/` only if vendor-agnostic | Cite primary docs; no invented hash/normalize rules |
| 3 | **Research / map *examples*** (fixtures only) | `evals/fixtures/`, proposal samples in PRs | Customer-owned patterns for tests — **not** package-shipped catalog truth |
| 3 | **Java / TS generate** | `skills/layerkit-generate-java`, `libs/generate/` | Enterprise Java default; TS scaffold optional |

**Do not open PRs that hardcode Meta/Google/TikTok/etc. field tables into `libs/` as product truth.** Those go stale and fight the design.

## Hard rules

1. **Primary source = vendor documentation.** Proposals without `sources[]` fail validation by design.
2. **No official vendor catalog.** Maps live under each project's `{projectDir}` (default `.layerkit`). Eval fixtures and synthetic `example_vendor` are tests only.
3. **Production path stays deterministic** (no LLM inside `track()`).
4. Keep PRs focused: one skill, one platform, one eval gate, or one docs fix when possible.

## Local setup

```bash
git clone https://github.com/hariharapanigrahy/layerkit.git
cd layerkit
npm install
npm test
npm run eval:ci    # merge bar
npm run smoke:codex   # optional platform smoke
```

Node.js **≥ 20**.

## Development workflow

1. Fork the repo on GitHub.
2. Create a branch: `git checkout -b feat/skill-research-gaps` (or `fix/…`, `docs/…`, `eval/…`)
3. Make changes + tests/evals.
4. `npm test` and, if you touch gates or CLI behavior, `npm run eval:ci`
5. Open a PR using the template. Link related issues.

### Agent-assisted contributions (recommended)

Use Layerkit itself while developing skills/process:

```bash
npm run build && npm link
layerkit install --platform <your-agent> --poc
# skill: layerkit-research-vendor → proposal.json (customer-owned, not a catalog entry)
layerkit proposal validate ./proposal.json
```

If the PR is an **example fixture** (not core catalog), put it under `evals/fixtures/` and attach sources in the PR description.

## PR checklist

- [ ] `npm test` passes
- [ ] New behavior has an eval gate or smoke script when relevant (`eval:ci` for merge-bar changes)
- [ ] Docs/skills updated if CLI or install UX changed
- [ ] Any vendor-facing knowledge cites official URLs (and is fixture/example, not core catalog)
- [ ] Does not add package-shipped maps for real ad/commerce vendors as “official” Layerkit truth

## Find an issue (community first)

Maintainers alone do not scale. **Claim an open issue** (comment “I’d like to take this”) before large work.

| Start here | Filter |
|------------|--------|
| [Good first contributions map (#48)](https://github.com/hariharapanigrahy/layerkit/issues/48) | Landing pad |
| Easy | [`good first issue`](https://github.com/hariharapanigrahy/layerkit/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) |
| Reliability (hallucination, timeout, transactions) | [`area: reliability`](https://github.com/hariharapanigrahy/layerkit/issues?q=is%3Aissue+is%3Aopen+label%3A%22area%3A+reliability%22) |
| Runtime / delivery | [`area: runtime`](https://github.com/hariharapanigrahy/layerkit/issues?q=is%3Aissue+is%3Aopen+label%3A%22area%3A+runtime%22) |
| Evals | [`area: evals`](https://github.com/hariharapanigrahy/layerkit/issues?q=is%3Aissue+is%3Aopen+label%3A%22area%3A+evals%22) |
| Skills / docs | [`area: skills`](https://github.com/hariharapanigrahy/layerkit/issues?q=is%3Aissue+is%3Aopen+label%3A%22area%3A+skills%22) |

Labels: `difficulty: easy|medium|hard`, `help wanted`. Each issue lists **where to look** and **acceptance criteria**.

### Reliability workflows (parallel tracks)

These are intentionally separate so different people can own them:

1. [#49 Hallucination detector](https://github.com/hariharapanigrahy/layerkit/issues/49) — fail-closed invent signals before apply  
2. [#50 track() timeouts](https://github.com/hariharapanigrahy/layerkit/issues/50) — overall + per-vendor budgets (`libs/runtime/timeout.ts` head start)  
3. [#51 Store transaction + rollback](https://github.com/hariharapanigrahy/layerkit/issues/51) — atomic multi-proposal apply  
4. [#52 track + delivery compose](https://github.com/hariharapanigrahy/layerkit/issues/52) — sendEvent / fail-fast  
5. [#60 Circuit breaker](https://github.com/hariharapanigrahy/layerkit/issues/60) — per-vendor open/half-open  

## Reporting bugs & ideas

- **Bugs:** [GitHub Issues](https://github.com/hariharapanigrahy/layerkit/issues/new?template=bug_report.yml)
- **Feature ideas:** [feature request](https://github.com/hariharapanigrahy/layerkit/issues/new?template=feature_request.yml) or Discussions (when enabled)
- **Vendor research notes / customer map examples:** [research template](https://github.com/hariharapanigrahy/layerkit/issues/new?template=vendor_map.yml) — for evidence tracking and skills/eval fixtures, **not** an official connector request queue

## Security

Do not file public issues for vulnerabilities that expose secrets. See [SECURITY.md](./SECURITY.md).

## License

By contributing, you agree your contributions are licensed under the **MIT License**.
