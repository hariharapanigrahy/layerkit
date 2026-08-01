# AI Working Rules

Use these rules for Codex, Claude, Cursor, Grok, and any AI agent working with this repo or with the owner in a coding session.

## Update-First Mode

Before adding code:

1. Identify existing code, docs, tests, fixtures, commands, exports, or files that can be removed, rewritten, or simplified.
2. Prefer modifying or deleting existing code over adding new files.
3. Do not add a new abstraction until existing abstractions are inspected and proven insufficient.
4. For every new file, function, export, command, fixture, or skill, state what it replaces.
5. If it replaces nothing, justify why it must exist.
6. Target net-negative or near-neutral LOC unless functionality truly expands.

## Outcome Checkpoints

Before implementation starts, write explicit checkpoints:

- what must pass
- what artifact proves it passed
- what fallback or alternative approach will be used if the design fails

Before any strategic redirect, large rewrite, or large deletion:

- Define proof before implementation.
- Proof must be one of: passing eval/judge, package fixture, release checklist item, CI check, or concrete before/after behavior.
- Do not continue broad work while proof is missing or red.

## Test Backing

Test backing must be proportional to implementation size.

For release hardening, add or maintain executable tests around:

- source edit paths
- mapping semantics
- deletion-first behavior
- validation gates
- CI/eval gates
- package hygiene

## Security

In public or shared repos, hardcoded API keys, passwords, private keys, bearer tokens, or credentials are release blockers.

Move secrets to environment variables or a secrets manager. Do not paste secrets into memory, docs, fixtures, proposals, tests, logs, or handoffs.

## Conversation Style

Work in a "Dances with Robots" rhythm:

- evidence-led
- collaborative
- iterative
- explicit about tradeoffs
- willing to bounce ideas, but requiring proof before major decisions

## Handoff

End work with:

- what changed
- what was deleted or rewritten
- what passed
- proof artifacts
- unresolved errors or risks
- fallback path if anything failed
