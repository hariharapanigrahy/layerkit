# Layerkit Agent Golden Path

Layerkit helps an AI agent update a client-owned vendor integration. The output is real source and tests in the client package, not a generated side project, runtime SDK, or PR metadata directory.

## Product Model

Layerkit provides:

- skills for agent behavior;
- local evidence, map, proposal, memory, and session files;
- deterministic validation tools for explicit artifacts;
- evals and judges that enforce evidence-first, deletion-first source editing.

Layerkit does not provide:

- runtime vendor routing;
- live HTTP delivery;
- semantic source rewriting from the CLI;
- deterministic rename inference;
- generated PR packages under `.layerkit/out`.

## Pipeline

```text
discover -> research -> design -> author -> privacy -> deletion-first -> source-edit -> handoff
```

Use:

```bash
layerkit agent status
layerkit agent next
layerkit agent mark-done --step <id>
```

The step ids are:

```text
discover
research
design
author
privacy
deletion-first
source-edit
handoff
```

## Full Integration

1. Discover the client datalayer, interfaces, mappers, vendor adapters, tests, and package conventions.
2. Research vendor docs/OpenAPI/curl examples and capture citations.
3. Decide the smallest source edit that updates existing code.
4. Update or author maps only when a map artifact is actually part of the client workflow.
5. Review privacy and consent impact from customer policy and source evidence.
6. Run deletion-first before adding code.
7. Edit production files and tests directly.
8. Run the client package build/tests plus Layerkit validation gates.
9. Write a handoff that names evidence, changed files, residual TODOs, and verification.

## Contract Heal

When a vendor contract changes, the agent must compare evidence with the existing client integration.

Correct behavior:

- If the vendor renamed a field and the client already has the source data, update the existing mapping in place.
- If the vendor added a field and the client datalayer already exposes it, map it directly.
- If the client datalayer does not expose required data, leave a TODO at the exact integration point and call it out in the handoff.
- If the vendor removed a field, remove or update the old mapping and related tests/docs.
- If evidence is ambiguous, stop with a residual human question instead of inventing semantics.

Example:

```java
payload.setName(event.getName());
payload.setEmailId(event.getEmail());
```

Here `email_id` is the vendor field and `event.getEmail()` is the existing client datalayer field. The agent updates the existing mapping; it does not add a new `getEmailId()` requirement unless the client truly needs a new field.

## Deletion-First Gate

Before adding source, docs, tests, exports, or fixtures:

1. Identify stale code/docs/tests that can be removed or rewritten.
2. Prefer updating existing files over creating new files.
3. Do not add an abstraction until the existing abstraction cannot be changed.
4. For every new file/function/export, list what it replaces.
5. Target net-negative or near-neutral LOC unless functionality expands.

## Deterministic CLI Scope

Use deterministic commands only for work they can do exactly:

```bash
layerkit doctor
layerkit repo status
layerkit map list
layerkit map show <vendor>
layerkit map validate <file>
layerkit proposal validate <file>
layerkit proposal submit <file>
layerkit proposal approve <id>
layerkit proposal apply <file-or-id>
layerkit memory list
layerkit memory append --type research --title "<title>" --body-file <file>
```

Do not expect CLI commands to solve semantic integration problems. The agent reads the docs and code, makes the decision, edits source, and verifies the package.

## Verification

Run the package-specific tests first, then Layerkit gates:

```bash
npm run build
npm run eval:ci
npm run pack:check
```

For a client package, also run the module build/test command that covers the edited integration.

## Handoff

The final handoff should include:

- vendor evidence used;
- files edited;
- deleted stale code/docs/tests;
- new TODOs caused by missing client datalayer support;
- build/test commands and results;
- privacy or legal questions that require a human.
