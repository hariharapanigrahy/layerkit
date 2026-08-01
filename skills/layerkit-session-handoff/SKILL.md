---
name: layerkit-session-handoff
description: Write a runbook to memory so the next agent can resume the integration loop safely.
---

# layerkit-session-handoff

End-of-session (or mid-pipeline) handoff: durable runbook under memory so another agent continues without re-inventing context.

## Protocol

1. Gather state:

```bash
layerkit repo status
layerkit proposal list
layerkit map list
layerkit agent status
layerkit memory index
layerkit doctor
```

2. Prefer the **handoff CLI** (template + pipeline status + memory write):

```bash
layerkit handoff write \
  --vendor <vendor> \
  --goal "<one-sentence outcome>" \
  --done "research: map validated" \
  --done "author: source helper updated" \
  --next "layerkit-privacy-review: confirm consent rules" \
  --next "layerkit agent mark-done --step privacy --evidence <path>" \
  --next "run package verification and checker review" \
  --blocked "need live credentials from owner" \
  --out memory
```

Writes `{projectDir}/memory/runbooks/handoff-<vendor|project>.md` and refreshes memory INDEX.

3. Or author manually with required sections:

```text
# Handoff runbook — <vendor or project>
## Goal
## Done
- skills completed, proposal ids, validate status
## In progress
- current skill, open files, partial drafts
## Blocked
- exact residual human questions; who to ask
## Evidence index
- key source URLs + memory paths
## Next 3 actions
1. ...
2. ...
3. ...
## Forbidden
- do not invent; do not apply without checker; do not open deny-paths
## Quality
- last package verification result; coverage if any
## Outcome checkpoints
- what had to pass; proof artifact; fallback if it failed
## Unresolved errors
- exact red gates, failing assertions, or residual risks
```

Manual persist:

```bash
layerkit memory append --type runbooks --title "handoff <vendor>" --vendor <vendor> --body-file ./handoff.md
layerkit memory index
```

4. Point the next agent at: `{projectDir}/memory/INDEX.md` + this runbook + `layerkit-orchestrate-integration`. Resume from `layerkit agent next`.

## Forbidden

- Dumping secrets, tokens, or raw PII into the runbook
- Claiming steps done without proposal/map evidence
- Instructing the next agent to invent missing fields

## Success criteria

- [ ] Runbook in `{projectDir}/memory/runbooks/handoff-*.md`
- [ ] INDEX.md lists the entry
- [ ] Required headings present (Goal, Done, In progress, Blocked, Evidence index, Next 3 actions, Forbidden, Quality)
- [ ] Next actions are ordered and skill-named
- [ ] Residual human questions are explicit
- [ ] Outcome checkpoints and unresolved errors are explicit
