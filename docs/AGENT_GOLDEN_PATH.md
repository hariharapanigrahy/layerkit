# Agent golden path

Canonical loop for building a vendor integration with Layerkit.

## Strict maker-checker (default)

1. Research vendor docs → author proposal (`sources[]` required).
2. `layerkit proposal validate <file>`
3. Submit for review → checker approves → status becomes `ready_to_apply`.
4. `layerkit proposal apply <file>` (only `ready_to_apply` under strict).
5. `layerkit process dry-run` / generate / `layerkit doctor`.

Default config:

```ts
makerChecker.legacyApplyWithoutApprove === false  // STRICT
```

`layerkit doctor` prints:

```text
makerChecker: mode=STRICT (requires ready_to_apply)
  legacyApplyWithoutApprove=false requireDistinct=true allowSelfApprove=false
```

## Re-enable legacy apply (migrate / break-glass)

If an existing workflow still applies `pending` proposals without approve, pin legacy **explicitly** (not the default):

**Project** (`{projectDir}/project.json`):

```json
{
  "makerChecker": {
    "legacyApplyWithoutApprove": true
  }
}
```

**User** (`~/.layerkit/config.json`):

```json
{
  "version": 1,
  "makerChecker": {
    "legacyApplyWithoutApprove": true
  }
}
```

Project overrides user. With legacy on, apply accepts `pending|validated|approved|ready_to_apply` and emits:

```text
LEGACY_APPLY: maker-checker bypass active
```

Doctor will show `mode=LEGACY` and a warning. Prefer flipping back to strict once the submit→approve path is wired.

## Related

- Skills: `layerkit-orchestrate-integration`, `layerkit-checker-assist`
- Evals: `maker-checker-strict-path`, `maker-checker-legacy-apply`
- Design: maker-checker states in `docs/designs/multi-vendor-integration-platform-redesign.md`
