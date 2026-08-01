# Agent golden path — Day-1 any-vendor integration

Integrate **any** vendor in one day using **orchestrate + CLI only**.  
Maps start empty. Agents research evidence, author customer-owned proposals, pass gates, then generate and promote. Runtime `track()` stays deterministic (no LLM on the hot path).

**Cheat sheet (one page):** [`CHEATSHEET.md`](./CHEATSHEET.md) · `layerkit cheatsheet`  
**Master skill:** [`skills/layerkit-orchestrate-integration/SKILL.md`](../skills/layerkit-orchestrate-integration/SKILL.md)  
**Multi-agent:** [`skills/layerkit-multi-agent/SKILL.md`](../skills/layerkit-multi-agent/SKILL.md) + `layerkit agent multi --vendor …`  
**Status CLI:** `layerkit agent status` / `layerkit agent next` / `layerkit agent mark-done --step <id>`

Placeholders used below:

| Placeholder | Meaning |
|-------------|---------|
| `<platform>` | `codex` \| `claude` \| `cursor` \| `copilot` \| `opencode` \| `openhands` \| `factory-droid` \| `antigravity` |
| `<project-dir>` | Store root (default `.layerkit`; or `--project-dir` / `LAYERKIT_PROJECT_DIR`) |
| `<vendor>` | Vendor id you choose (customer-owned; not a catalog slot) |
| `<intent>` | Domain intent (e.g. `purchase`, `signup`) |
| `<agentId>` | Maker agent identity for submit |
| `<humanId>` | Human checker / privacy reviewer identity |
| `<proposal.json>` | Path to a draft proposal file |
| `<proposal-id>` | Id after submit (or file path accepted by CLI) |
| `<openapi.yaml>` | Path to OpenAPI/Swagger file |
| `<curl.txt>` | Path to a curl sample (or inline curl string) |
| `<hub.md>` | Path to a docs hub markdown with links |
| `<sheet.json>` | Path for research answer sheet output |

Optional global flag on every command: `--project-dir <project-dir>`.

---

## Day-1 flow (ordered)

```text
install → agent status/next → research CLI → design → author proposal
  → validate / submit / approve → generate → dry-run → doctor → promote
```

Follow [`layerkit-orchestrate-integration`](../skills/layerkit-orchestrate-integration/SKILL.md). After each major step:

```bash
layerkit agent mark-done --step <id>
layerkit agent next
```

Pipeline step ids (see `layerkit agent status`): `discover` · `research` · `design` · `author` · `privacy` · `generate` · `handoff`.

---

### 1. Install

Skill: [`layerkit-bootstrap`](../skills/layerkit-bootstrap/SKILL.md)

`layerkit` is published on npm, so the golden path uses the released package — no clone or build required:

```bash
npm install -g layerkit
# or run without installing: npx layerkit <command>

cd /path/to/your/app
layerkit install --platform <platform> --hooks enabled --auto-map-updates enabled --poc
layerkit doctor
layerkit repo status
layerkit memory index
```

> **Contributors / from-source only.** If you are hacking on layerkit itself, build from a clone instead of the published package:
>
> ```bash
> git clone https://github.com/hariharapanigrahy/layerkit.git
> cd layerkit
> npm install && npm run build && npm link
> ```

- Do **not** invent vendor field maps during install.
- Confirm project store path and that `{projectDir}/memory/` exists.

```bash
layerkit agent status
layerkit agent next
```

---

### 2. Agent status / next (stay on the rail)

```bash
layerkit agent status
layerkit agent next
# when a step is truly done:
layerkit agent mark-done --step <id>
```

Use status/next as the **only** progress source of truth. If context is low, hand off with [`layerkit-session-handoff`](../skills/layerkit-session-handoff/SKILL.md) and resume from `agent next`.

For the production send path and the distinction between runtime and delivery, see the [Runtime Send Path](#runtime-send-path) section in this document.

---

## Runtime Send Path

Layerkit intentionally separates deterministic runtime from network delivery.

### Runtime

The runtime is implemented in [libs/runtime/track.ts](../libs/runtime/track.ts).

It is responsible for:

- selecting eligible vendor maps
- resolving routing policies when requested
- applying maps or executing flows
- evaluating privacy
- producing diagnostics when no vendor is eligible
- emitting observation/audit data

Runtime does **not** perform production HTTP delivery.

### Delivery

The delivery layer is implemented in [libs/delivery/simulator.ts](../libs/delivery/simulator.ts) and [libs/delivery/index.ts](../libs/delivery/index.ts).

It is responsible for:

- idempotency
- retry
- HTTP requests
- DLQ handling
- network-failure handling

## Production Send Path

The production path is:

```text
Application event
  │
  ▼
track(event, maps, opts)
  │
  ▼
trackResult
  │
  ▼
Application chooses delivery
  │
  ▼
createDeliverySimulator(...)
  │
  ▼
deliver(req, 'live')
  │
  ▼
sendWithRetry()
  │
  ▼
Vendor API
```

`track()` is a runtime step from the perspective of delivery: it prepares the event, but it does not send the network request.

**Applications must provide the glue.** Layerkit does not call `deliver()` for you. After `track()` returns a `TrackResult`, your app inspects `result.results` (`VendorTrackResult[]`) and constructs a `DeliveryRequest` for each vendor:

```text
track(event, maps, opts)
  → TrackResult { results: VendorTrackResult[] }

Application inspects result.results
  → build a DeliveryRequest per vendor
    (url / method / headers come from your vendor map config,
     wire comes from VendorTrackResult.wire)

createDeliverySimulator({ projectDir, allowNetwork: true })
  .deliver(deliveryRequest)
  → sendWithRetry() → Vendor API
```

## Runtime Responsibilities

`track()` handles the following work before delivery:

- vendor selection
- flow execution
- map application
- privacy checks
- diagnostics
- observation events

That means a new contributor should not expect `track()` to issue HTTP requests.

## Delivery Responsibilities

`DeliverySimulator` handles the network side:

- `dry_run` means no network calls
- `shadow` means no network calls
- `live` means HTTP is allowed only when explicitly enabled

The simulator uses `sendWithRetry()` for live delivery and records failures in the DLQ when delivery cannot succeed.

### Delivery modes

| Mode | Network | Notes |
|------|---------|-------|
| `dry_run` | No | Simulated success |
| `shadow` | No | Simulated success |
| `live` | Yes, only when explicitly allowed | Uses HTTP, retry, idempotency, and DLQ handling |

## Important Unsupported Path

> **Unsupported and will not be fixed in the runtime path:** Flow live HTTP is not supported inside `track()` or any flow step. `track()` is intentionally kept network-free so it stays deterministic and testable.

Do not expect `track()` or a flow step to open network connections. If your application needs production HTTP delivery, your code must explicitly connect `TrackResult` to the delivery layer using `createDeliverySimulator().deliver()` as shown in the [Production Send Path](#production-send-path) section above.

## Why This Split Exists

This separation keeps the architecture easier to test and reason about:

- runtime can stay deterministic even when a vendor is slow or unavailable
- delivery can retry and isolate network failures
- privacy and routing remain independent from network code
- applications can decide when and how to send

## Where to Read Next

- [README.md](../README.md) for the product summary and contributor entry points
- [apps/cli/main.ts](../apps/cli/main.ts) for CLI orchestration
- [libs/runtime/track.ts](../libs/runtime/track.ts) for runtime execution
- [libs/delivery/simulator.ts](../libs/delivery/simulator.ts) for delivery behavior
- [docs/AGENT_GOLDEN_PATH.md](./AGENT_GOLDEN_PATH.md) for the agent workflow

---

### 3. Research CLI (evidence first)

Skills: [`layerkit-discover-data-layer`](../skills/layerkit-discover-data-layer/SKILL.md) · [`layerkit-research-vendor`](../skills/layerkit-research-vendor/SKILL.md)

Discover customer domain events/fields from **their** code (no secrets). Then research the vendor from **primary evidence** only.

```bash
# Inspect store (maps may be empty skeletons)
layerkit map list
layerkit map show <vendor>
layerkit memory list --vendor <vendor>

# Contract intake (first-time or heal when map exists)
layerkit research fill \
  --vendor <vendor> \
  --openapi <openapi.yaml> \
  [--doc <url>] \
  --out <sheet.json>
# pins out/contracts/<vendor>/ · CONTRACT_DRIFT.json · mode=heal if map applied

layerkit research openapi <openapi.yaml> [--json]
layerkit research curl <curl.txt> [--json]
layerkit research deepen <hub.md> [--json]
layerkit research gaps <sheet.json> [--json]

# Fan-out after contract update
layerkit agent multi --vendor <vendor> --mode heal --openapi <openapi.yaml>

# Persist a redacted research note
layerkit memory append \
  --type research \
  --title "<vendor> research" \
  --vendor <vendor> \
  --body-file ./research-note.md
```

**Deepen before humans:** run L0–L4 (hub links, `$ref`, repo samples, customer-approved probe) before any questionnaire.  
**Never invent** auth, endpoints, hash, or field rules when evidence is silent — leave `needs-evidence` / residual gaps.

```bash
layerkit agent mark-done --step discover   # when domain discovery is done
layerkit agent mark-done --step research   # when answer sheet + memory note are done
layerkit agent next
```

---

### 4. Design

Skills: [`layerkit-design-integration`](../skills/layerkit-design-integration/SKILL.md) · optional [`layerkit-design-flow`](../skills/layerkit-design-flow/SKILL.md)

Choose **linear map** (default) vs **flow** (sequence / branch / foreach) from evidence. Record the decision:

```bash
layerkit memory append \
  --type proposals \
  --title "<vendor> integration design" \
  --vendor <vendor> \
  --body-file ./design.md
```

Prefer flat `VendorMap`. Author a flow only when OpenAPI/curl requires multi-step, routing, or batching.

```bash
layerkit agent mark-done --step design
layerkit agent next
```

---

### 5. Author proposal

Skills: [`layerkit-author-map`](../skills/layerkit-author-map/SKILL.md) · [`layerkit-author-processor`](../skills/layerkit-author-processor/SKILL.md) · optional [`layerkit-design-flow`](../skills/layerkit-design-flow/SKILL.md) · [`layerkit-privacy-review`](../skills/layerkit-privacy-review/SKILL.md) · optional [`layerkit-align-client-style`](../skills/layerkit-align-client-style/SKILL.md)

Draft `vendor_map` / processor / flow proposals with mandatory `sources[]` (customer-accepted URLs, OpenAPI paths, code citations). Every critical field row and transform must point at evidence.

Privacy: strengthen policy **before** live PII egress ([`layerkit-privacy-review`](../skills/layerkit-privacy-review/SKILL.md)).

```bash
# example after drafting files
ls ./proposals/
# <proposal.json>  # vendor_map, processor, flow, privacy as needed
```

```bash
layerkit agent mark-done --step author    # after proposals are ready to gate
# privacy step requires human when PII egress is in scope
layerkit agent mark-done --step privacy   # only after privacy review is done
layerkit agent next
```

---

### 6. Validate → submit → approve (maker-checker)

Skill (read-only assist): [`layerkit-checker-assist`](../skills/layerkit-checker-assist/SKILL.md)

```bash
layerkit proposal validate <proposal.json>
layerkit proposal submit <proposal.json> --by <agentId>
layerkit proposal list

# HUMAN checker only (never self-approve as the same maker identity)
layerkit proposal approve <proposal-id> --by <humanId> --role checker
# or: layerkit proposal reject <proposal-id> --by <humanId> --role checker --comment "..."

# After approved:
layerkit proposal apply <proposal-id>
```

Strict maker-checker: maker ≠ checker. Use `layerkit-checker-assist` for a risk checklist only — it must not call approve/apply/promote.

---

### 7. Generate

Skill: [`layerkit-generate-java`](../skills/layerkit-generate-java/SKILL.md)

```bash
layerkit generate --module-root <path-to-module> [--vendor <id>] [--apply]
# → {projectDir}/out/INTEGRATE.md (+ integrate-plan.json)
```

Implement creates/patches listed in `INTEGRATE.md` **in the customer module**.

Target: JaCoCo line coverage ≥ 0.95 on the module under test when quality gates are enforced.

Pin targets in `{projectDir}/project.json`:

```json
{
  "generate": {
    "moduleRoot": "path/to/integrations-module",
    "qualityRoots": ["path/to/integrations-module"]
  }
}
```

```bash
layerkit agent mark-done --step generate
layerkit agent next
```

---

### 8. Dry-run (and fix loop)

Skills: orchestrate stop rules · [`layerkit-fix-from-dry-run`](../skills/layerkit-fix-from-dry-run/SKILL.md)

```bash
layerkit process dry-run --vendor <vendor> --intent <intent>
```

On failure: revise map/processor/flow from **docs evidence** via `layerkit-fix-from-dry-run`, re-validate/submit/approve/apply, dry-run again.  
**Loop ≤ 3** times; then stop and ask a human. Do not invent patches to force green.

---

### 9. Doctor (quality)

```bash
layerkit doctor
layerkit doctor --quality --strict
```

Doctor must be clean (or only expected empty-map warnings for vendors not in scope). Quality/strict requires the JaCoCo report under the generated client.

---

### 10. Promote

```bash
layerkit promote --vendor <vendor>
# Hard gates (fail-closed): map_complete + fields/intents, JaCoCo quality (--strict default),
# doctor secret-scan clean, privacy policy when PII-looking fields, dry-run wire for purchase/first intent.
# Break-glass: --no-strict (skip quality), --no-dry-run-check (skip dry-run only)
layerkit agent status
layerkit agent mark-done --step handoff
```

Promote sets `map_complete` → `live` only after hard gates pass. Fix failed gate lines, then retry; do not bypass secrets or map_status.

---

## When to ask a human (residual gaps only)

Ask humans **only** after evidence is exhausted. Do **not** open a full questionnaire while OpenAPI/curl/code still answer the question.

| Ask a human | Do **not** ask |
|-------------|----------------|
| Residual Q dimensions after deepen L0–L4 (`layerkit research gaps`) | Q1/Q2 already answered from OpenAPI/curl |
| Legal basis / consent purposes missing from customer docs | Field names present in customer code (discover) |
| Checker / privacy_reviewer approval (never self-approve as maker) | Re-deriving facts already in `{projectDir}/memory/` |
| Production host credentials and live probe consent | Inventing values to avoid residual gaps |
| Ambiguous multi-contract product routing | Skipping privacy to ship faster |
| After 3 failed dry-run fix loops | Continuing to invent after stop conditions |

Orchestrate stop conditions (full list): [`skills/layerkit-orchestrate-integration/SKILL.md`](../skills/layerkit-orchestrate-integration/SKILL.md).

---

## Skills index

| Skill | Path |
|-------|------|
| Orchestrate (master) | [`skills/layerkit-orchestrate-integration/SKILL.md`](../skills/layerkit-orchestrate-integration/SKILL.md) |
| Bootstrap / install | [`skills/layerkit-bootstrap/SKILL.md`](../skills/layerkit-bootstrap/SKILL.md) |
| Discover domain | [`skills/layerkit-discover-data-layer/SKILL.md`](../skills/layerkit-discover-data-layer/SKILL.md) |
| Research vendor | [`skills/layerkit-research-vendor/SKILL.md`](../skills/layerkit-research-vendor/SKILL.md) |
| Design integration | [`skills/layerkit-design-integration/SKILL.md`](../skills/layerkit-design-integration/SKILL.md) |
| Design flow | [`skills/layerkit-design-flow/SKILL.md`](../skills/layerkit-design-flow/SKILL.md) |
| Author map | [`skills/layerkit-author-map/SKILL.md`](../skills/layerkit-author-map/SKILL.md) |
| Author processor | [`skills/layerkit-author-processor/SKILL.md`](../skills/layerkit-author-processor/SKILL.md) |
| Privacy review | [`skills/layerkit-privacy-review/SKILL.md`](../skills/layerkit-privacy-review/SKILL.md) |
| Align client style | [`skills/layerkit-align-client-style/SKILL.md`](../skills/layerkit-align-client-style/SKILL.md) |
| Generate Java | [`skills/layerkit-generate-java/SKILL.md`](../skills/layerkit-generate-java/SKILL.md) |
| Fix from dry-run | [`skills/layerkit-fix-from-dry-run/SKILL.md`](../skills/layerkit-fix-from-dry-run/SKILL.md) |
| Checker assist (read-only) | [`skills/layerkit-checker-assist/SKILL.md`](../skills/layerkit-checker-assist/SKILL.md) |
| Session handoff | [`skills/layerkit-session-handoff/SKILL.md`](../skills/layerkit-session-handoff/SKILL.md) |

---

## Research CLI quick reference

Implemented over `libs/research` (parse OpenAPI/curl, deepen hubs, fill answer sheets, residual gaps):

```bash
layerkit research openapi <file> [--json]
layerkit research curl <file-or-inline> [--json]
layerkit research deepen <hub.md> [--json]
layerkit research fill [--openapi <file>]... [--curl <file>]... [--hub <file>]... [--vendor <id>] [--out <sheet.json>] [--json]
layerkit research gaps <sheet.json> [--json]
```

Related store commands:

```bash
layerkit memory list|show|append|index ...
layerkit map list|show|validate ...
layerkit proposal validate|submit|approve|reject|apply|list ...
layerkit process dry-run --vendor <v> --intent <i>
layerkit generate --lang java
layerkit doctor [--quality] [--strict]
layerkit promote [--vendor <id>]
layerkit agent status|next|mark-done
```

---

## Forbidden

- Treating any package seed or third-party snippet as product field truth without customer re-verify
- Inventing maps/endpoints/hash rules to look complete
- Skipping privacy before live PII egress
- Approving your own proposals in strict maker-checker
- LLM on the `track()` hot path
- Continuing after 3 failed fix-from-dry-run loops without a human

---

## Success criteria (Day 1)

- [ ] `layerkit doctor` green for in-scope work
- [ ] Research answer sheet + residual gaps recorded; no silent invention
- [ ] Proposals applied with `sources[]`
- [ ] Human checker (and privacy when needed) approved — maker ≠ checker
- [ ] `process dry-run` green for primary intents
- [ ] `generate --lang java` + quality gate (`doctor --quality --strict`) green
- [ ] `promote --vendor <vendor>` → live
- [ ] Pipeline markers updated (`layerkit agent status`)

---

## Maker-checker (strict by default)

Strict mode is the production default: apply only proposals in `ready_to_apply`.

Default config:

```ts
makerChecker.legacyApplyWithoutApprove === false  // STRICT
```

`layerkit doctor` prints:

```text
makerChecker: mode=STRICT (requires ready_to_apply)
  legacyApplyWithoutApprove=false requireDistinct=true allowSelfApprove=false
```

### Re-enable legacy apply (migrate / break-glass)

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
  "makerChecker": {
    "legacyApplyWithoutApprove": true
  }
}
```

No automatic “missing key → true”; pin explicitly if needed.

