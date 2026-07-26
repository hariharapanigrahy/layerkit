# Making Layerkit open source & inviting contributors

This doc is for maintainers (and anyone launching a similar project).

## 1. Legal / packaging basics (done in this repo)

| Item | Status |
|------|--------|
| **MIT LICENSE** | Required for permissive OSS |
| **CONTRIBUTING.md** | How to help |
| **CODE_OF_CONDUCT.md** | Community norms |
| **SECURITY.md** | Private vuln reporting |
| **Issue / PR templates** | Lower friction |
| **CI on PRs** | Trust for first-time contributors |
| **`private: false` + npm-ready `files`** | Publishable package |

## 2. Publish the GitHub repository

```bash
cd /Users/pallavisahoo/Documents/layerkit

# one-time GitHub auth (browser)
gh auth login

# create PUBLIC repo under your user and push
gh repo create hariharapanigrahy/layerkit \
  --public \
  --source=. \
  --remote=origin \
  --description "Agent-first multi-vendor data-layer toolkit (Java-first, multi-platform install, evals)" \
  --push
```

Or manually: create empty public repo on github.com →:

```bash
git remote add origin git@github.com:hariharapanigrahy/layerkit.git
git push -u origin main
```

### Recommended GitHub settings (UI)

1. **Settings → General → Features:** Issues, Discussions (optional), Projects off unless needed  
2. **Settings → Collaborators:** invite maintainers  
3. **Settings → Branches → Branch protection** on `main`:  
   - Require PR  
   - Require status checks: `ci`  
4. **Settings → Codespaces / Actions:** allow Actions  
5. **About (right sidebar):** description, topics: `integrations`, `ai-agents`, `java`, `data-layer`, `sdk`  
6. **Social:** pin repo on profile  

## 3. Invite others to contribute

### A. In-repo signals (high leverage)

- Mark good first issues: label `good first issue` and `help wanted`
- Prefer issues on **skills, eval gates, install platforms, docs/UX** — not “fill the catalog”
- Optional research-tracking issues via the vendor research template (examples/fixtures only)
- Pin a “Contributing” Discussion or README section

### B. Public call-to-action (copy/paste)

**GitHub Discussions / LinkedIn / X / Discord:**

> We open-sourced **Layerkit** — an agent-first toolkit for multi-vendor data layers (install into Codex/Claude/Cursor, research vendor docs into reviewable map proposals, Java client for enterprises).
>
> **No vendor catalog:** maps are customer-owned; agents research any vendor from official docs with citations.
>
> **Contribute:** skills, process evals, platform installers, docs — see CONTRIBUTING.md.
>
> Repo: https://github.com/hariharapanigrahy/layerkit  
> Guide: CONTRIBUTING.md

### C. Community channels

| Channel | Use |
|---------|-----|
| GitHub Issues | Bugs, features, research notes (not official connectors) |
| GitHub Discussions | Q&A, design |
| Discord/Slack (optional) | Real-time; link from README |
| npm | `npm publish` after 0.1.0 tag for discoverability |

### D. First contribution path (lowest friction)

1. Label 5 issues `good first issue` (e.g. “add eval gate for X”, “improve install prompt”, “Claude skill gap”)  
2. Link agent install prompt when the issue needs agent testing  
3. Review PRs within a few days — responsiveness grows community  

## 4. npm publish (optional, after public repo)

```bash
npm login
npm version 0.1.0
npm publish --access public
```

Ensure `package.json` name `layerkit` is available, or use `@hariharapanigrahy/layerkit` / `@layerkit/cli` if taken.

## 5. Relationship to Integration Knowledge Graph

Layerkit is a **standalone OSS** project. IKG (SaaS reverse contracts) can depend on or generate Layerkit artifacts later; keep this repo free of private IKG secrets and monorepo coupling.
