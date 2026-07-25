#!/usr/bin/env bash
# Create public GitHub repo and push (run once after: gh auth login)
set -euo pipefail
cd "$(dirname "$0")/.."

git config user.name "Harihara Panigrahy"
git config user.email "hhp263@gmail.com"

if ! gh auth status &>/dev/null; then
  echo "Run: gh auth login"
  echo "  Choose: GitHub.com → HTTPS or SSH → Login with browser"
  exit 1
fi

if git remote get-url origin &>/dev/null; then
  echo "Remote origin already set: $(git remote get-url origin)"
  git push -u origin main
else
  gh repo create hariharapanigrahy/layerkit \
    --public \
    --source=. \
    --remote=origin \
    --description "Agent-first multi-vendor data-layer toolkit (Java-first, multi-platform install, evals)" \
    --push
fi

echo ""
echo "Public repo: https://github.com/hariharapanigrahy/layerkit"
echo "Next: enable Discussions, add topics, open 'help wanted' vendor issues."
echo "See docs/OPEN_SOURCE_LAUNCH.md"
