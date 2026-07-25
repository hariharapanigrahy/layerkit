# Contributing to Layerkit

Thanks for helping build an **agent-first multi-vendor data-layer toolkit**.  
This project is intentionally open: vendor maps, processors, platform installers, and evals all improve with community research.

## Code of conduct

Be respectful. See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## Ways to contribute (pick one)

| Contribution | Where | Notes |
|--------------|--------|--------|
| **Vendor map** (research from official docs) | Proposal PR + `.layerkit` fixture or `evals/fixtures/` | Must include `sources[]` with doc URLs + excerpts |
| **Processor** (email/phone/time rules) | `libs/` only if generic; prefer agent proposals + eval | Cite primary docs; no invented hash rules |
| **Agent platform install** | `libs/install/platforms/` + `scripts/smoke-*.mjs` | Mirror greplica-style skill/hook paths |
| **Eval case** | `evals/cases/<name>/run.ts` + `rubric.json` | CI-runnable preferred |
| **Java generation skill / scaffold** | `skills/layerkit-generate-java`, `libs/generate/` | Enterprise Java is the default language target |
| **Docs / install UX** | `README.md`, `docs/`, skills | Clear agent prompts help adoption |

## Hard rules

1. **Primary source = vendor documentation.** Proposals without `sources[]` fail validation by design.
2. **Do not hardcode Meta/Google/etc. field tables into core** as “truth.” Prefer agent-authored maps applied via proposals.
3. **Production path stays deterministic** (no LLM inside `track()`).
4. Keep PRs focused; one vendor or one platform per PR when possible.

## Local setup

```bash
git clone https://github.com/hariharapanigrahy/layerkit.git
cd layerkit
npm install
npm test
npm run smoke:codex   # optional
```

Node.js **≥ 20**.

## Development workflow

1. Fork the repo on GitHub.
2. Create a branch: `git checkout -b feat/vendor-snapchat-map`
3. Make changes + tests/evals.
4. `npm test`
5. Open a PR using the template. Link related issues.

### Agent-assisted contributions (recommended)

Use Layerkit itself:

```bash
npm run build && npm link
layerkit install --platform <your-agent> --poc
# skill: layerkit-research-vendor → proposal.json
layerkit proposal validate ./proposal.json
```

Attach the proposal (and sources) to the PR description.

## PR checklist

- [ ] `npm test` passes
- [ ] New behavior has an eval or smoke script when relevant
- [ ] Docs/skills updated if CLI or install UX changed
- [ ] Vendor knowledge cites official URLs

## Reporting bugs & ideas

- **Bugs:** [GitHub Issues](https://github.com/hariharapanigrahy/layerkit/issues/new?template=bug_report.yml)
- **Vendor map requests:** [Issue template](https://github.com/hariharapanigrahy/layerkit/issues/new?template=vendor_map.yml)
- **Feature ideas:** [Discussions](https://github.com/hariharapanigrahy/layerkit/discussions) (once enabled) or an issue

## Security

Do not file public issues for vulnerabilities that expose secrets. See [SECURITY.md](./SECURITY.md).

## License

By contributing, you agree your contributions are licensed under the **MIT License**.
