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
layerkit memory index
layerkit doctor
```

2. Write a **runbook** covering:

```text
# Handoff runbook — <vendor or project>
## Goal
## Done
- skills completed, proposal ids, validate status
## In progress
- current skill, open files, partial drafts
## Blocked / residual human
- exact questions; who to ask
## Evidence index
- key source URLs + memory paths
## Next 3 actions
1. ...
2. ...
3. ...
## Forbidden for next agent
- do not invent; do not apply without checker; do not open deny-paths
## Quality
- last dry-run result; coverage if any
```

3. Persist:

```bash
layerkit memory append --type runbooks --title "handoff <vendor>" --vendor <vendor> --body-file ./handoff.md
layerkit memory index
```

4. Point the next agent at: `{projectDir}/memory/INDEX.md` + this runbook + `layerkit-orchestrate-integration`.

## Forbidden

- Dumping secrets, tokens, or raw PII into the runbook
- Claiming steps done without proposal/map evidence
- Instructing the next agent to invent missing fields

## Success criteria

- [ ] Runbook in `{projectDir}/memory/runbooks/`
- [ ] INDEX.md lists the entry
- [ ] Next actions are ordered and skill-named
- [ ] Residual human questions are explicit
