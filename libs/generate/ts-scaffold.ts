import type { DomainSpec, LayerProject, VendorMap } from '../domain/types.js';
import type { GeneratedFile } from './java-scaffold.js';

function packageName(name: string): string {
  const n = name
    .replace(/[^a-z0-9-]/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return n || 'layerkit-client';
}

function escapeJsonString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Generate TypeScript client scaffold for dry-run parity with Java generate.
 * Same maps/domain input; second runtime language scaffold (not a full enterprise client).
 */
export function generateTsScaffold(opts: {
  project: LayerProject;
  domain: DomainSpec;
  maps: VendorMap[];
}): GeneratedFile[] {
  const filled = opts.maps.filter((m) => m.fields.length || Object.keys(m.intents).length);
  const empty = opts.maps.filter((m) => !m.fields.length && !Object.keys(m.intents).length);
  const name = packageName(opts.project.name);
  const filledVendors = filled.map((m) => m.vendor);
  const emptyVendors = empty.map((m) => m.vendor);
  const intents = opts.domain.intents.map((i) => i.id);

  return [
    {
      path: 'package.json',
      content: packageJson(name),
    },
    {
      path: 'src/index.ts',
      content: indexTs(name, filledVendors, intents),
    },
    {
      path: 'src/vendor/types.ts',
      content: vendorTypesTs(),
    },
    {
      path: 'src/apply-map.ts',
      content: applyMapTs(),
    },
    {
      path: 'README.md',
      content: readmeMd(name, filledVendors, emptyVendors, intents),
    },
  ];
}

function packageJson(name: string): string {
  return `{
  "name": "${escapeJsonString(name)}",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Layerkit-generated TypeScript data-layer client (dry-run scaffold)",
  "main": "src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "engines": {
    "node": ">=20"
  }
}
`;
}

function indexTs(name: string, filledVendors: string[], intents: string[]): string {
  const vendorList =
    filledVendors.length > 0
      ? filledVendors.map((v) => ` *   - ${v}`).join('\n')
      : ' *   (none yet — research maps first)';
  const intentList =
    intents.length > 0
      ? intents.map((i) => ` *   - ${i}`).join('\n')
      : ' *   (see domain spec)';

  return `/**
 * Layerkit TypeScript data-layer client scaffold (${name}).
 *
 * Facade entry: {@link DataLayerClient}. Runtime must stay deterministic —
 * no LLM on the hot path. Prefer dry_run mode until maps + privacy are ready.
 *
 * Filled vendors to implement:
${vendorList}
 *
 * Domain intents:
${intentList}
 *
 * Maps live in the Layerkit project store; this package stubs apply for
 * dry-run demos. Full map execution uses Layerkit's map engine (same maps
 * as the Java client).
 */

import { applyMapDryRun, type DryRunApplyResult } from './apply-map.js';
import type { DomainEvent, TrackResult } from './vendor/types.js';

export type { DomainEvent, TrackResult, VendorMapLite } from './vendor/types.js';
export { applyMapDryRun } from './apply-map.js';
export type { DryRunApplyResult } from './apply-map.js';

/** Runtime mode for the client. dry_run never egresses. */
export type ClientMode = 'dry_run' | 'shadow' | 'live';

export interface DataLayerClientOptions {
  /** Default mode; dry_run is safest for demos and CI. */
  mode?: ClientMode;
  /** Vendor ids this facade will fan out to (filled maps). */
  vendors?: string[];
}

/**
 * Facade for multi-vendor tracking (TypeScript parity with Java DataLayerClient).
 *
 * \`track(intent, event)\` documents and exercises dry_run mode: it returns a
 * structured result without network I/O. Wire real adapters + Layerkit maps
 * before switching to shadow/live.
 */
export class DataLayerClient {
  readonly mode: ClientMode;
  readonly vendors: readonly string[];

  constructor(opts: DataLayerClientOptions = {}) {
    this.mode = opts.mode ?? 'dry_run';
    this.vendors = Object.freeze([...(opts.vendors ?? [])]);
  }

  /**
   * Track a domain intent.
   *
   * In **dry_run** mode (default): maps are applied as stubs only — no HTTP,
   * no secrets egress. Result includes \`mode: 'dry_run'\` per vendor.
   *
   * @param intent domain intent id (e.g. purchase)
   * @param event domain event payload
   */
  track(intent: string, event: DomainEvent = {}): TrackResult {
    const results: DryRunApplyResult[] = [];
    const targets = this.vendors.length > 0 ? this.vendors : ['(no vendors registered)'];

    for (const vendor of targets) {
      if (this.mode === 'dry_run') {
        results.push(applyMapDryRun({ intent, vendor, event }));
      } else {
        // Scaffold only: non-dry_run still returns dry_run-shaped stub until implemented.
        results.push({
          mode: 'dry_run',
          intent,
          vendor,
          note: 'mode ' + this.mode + ' not fully implemented in scaffold; treating as dry_run',
          event,
        });
      }
    }

    return {
      intent,
      mode: this.mode,
      results,
    };
  }
}
`;
}

function vendorTypesTs(): string {
  return `/**
 * Simplified VendorMap-ish types for the generated TS client.
 * Full maps remain in the Layerkit project (vendor memory); this is a
 * lightweight surface for dry-run demos and type-safe stubs.
 */

/** Domain event bag passed to track / apply. */
export type DomainEvent = Record<string, unknown>;

/** Minimal field row (subset of Layerkit FieldMapRow). */
export interface FieldMapRowLite {
  domain: string;
  vendor: string;
  transform?: { type: string; processorId?: string };
  notes?: string;
}

/**
 * Simplified vendor map shape (VendorMap-ish).
 * Not a full V1/V2 dual-read model — see Layerkit domain types for source of truth.
 */
export interface VendorMapLite {
  vendor: string;
  displayName?: string;
  version?: string;
  intents?: Record<string, { eventName?: string } | string>;
  fields?: FieldMapRowLite[];
  status?: 'skeleton' | 'map_complete' | 'live' | 'deprecated';
  documentation?: Array<{ title?: string; url: string }>;
}

/** Aggregate result from DataLayerClient.track */
export interface TrackResult {
  intent: string;
  mode: 'dry_run' | 'shadow' | 'live';
  results: Array<{
    mode: 'dry_run';
    intent: string;
    vendor: string;
    note?: string;
    event?: DomainEvent;
  }>;
}
`;
}

function applyMapTs(): string {
  return `/**
 * Map apply for the TS scaffold.
 *
 * Runtime production path uses Layerkit maps via the Layerkit map engine
 * (\`applyVendorMap\` in libs/vendor-memory) — same maps as Java / CLI
 * \`layerkit process dry-run\`. This module is a **thin dry-run demo stub** only.
 */

import type { DomainEvent } from './vendor/types.js';

export interface DryRunApplyResult {
  mode: 'dry_run';
  intent: string;
  vendor: string;
  note?: string;
  event?: DomainEvent;
}

export interface ApplyMapDryRunInput {
  intent: string;
  vendor: string;
  event?: DomainEvent;
}

/**
 * Stub apply for dry-run demo.
 * Returns \`{ mode: 'dry_run', intent, vendor }\` without network or real map execution.
 */
export function applyMapDryRun(input: ApplyMapDryRunInput): DryRunApplyResult {
  return {
    mode: 'dry_run',
    intent: input.intent,
    vendor: input.vendor,
    note: 'Scaffold stub — runtime uses Layerkit maps (applyVendorMap / process dry-run)',
    event: input.event,
  };
}
`;
}

function readmeMd(
  name: string,
  filledVendors: string[],
  emptyVendors: string[],
  intents: string[],
): string {
  const filled =
    filledVendors.length > 0
      ? filledVendors.map((v) => `- \`${v}\``).join('\n')
      : '_None — research vendors first_';
  const empty =
    emptyVendors.length > 0
      ? emptyVendors.map((v) => `- \`${v}\``).join('\n')
      : '_None_';
  const intentLines =
    intents.length > 0 ? intents.map((i) => `- \`${i}\``).join('\n') : '_See domain spec_';

  return `# ${name} (Layerkit TypeScript client)

Generated TypeScript **dry-run scaffold** for multi-vendor data-layer tracking.
Parity path with \`layerkit generate --lang java\`: same project maps/domain;
this is a second runtime language scaffold, not a full enterprise client yet.

## Generate

\`\`\`bash
layerkit generate --lang ts
# or: --lang typescript
# default out: {projectDir}/out/ts
\`\`\`

## Layout

| Path | Role |
|------|------|
| \`package.json\` | \`"type": "module"\`, name from project |
| \`src/index.ts\` | **Facade** — \`DataLayerClient.track(intent, event)\` (dry_run) |
| \`src/vendor/types.ts\` | VendorMap-ish simplified types |
| \`src/apply-map.ts\` | Dry-run apply stub; real runtime uses Layerkit maps |
| \`README.md\` | This file |

## Domain intents

${intentLines}

## Implement now (filled maps)

${filled}

## Research first (empty)

${empty}

## Dry-run mode

\`DataLayerClient\` defaults to \`mode: 'dry_run'\`. \`track(intent, event)\` returns
structured results with \`mode: 'dry_run'\` and **does not egress**.

Full map execution and privacy gates remain on the Layerkit CLI / map engine:

\`\`\`bash
layerkit process dry-run --vendor <id> --intent <i>
\`\`\`

## Next steps

1. Fill maps via research + proposals (citations required).
2. Prefer Java generate for enterprise promote (\`layerkit-generate-java\`) until TS is fully implemented.
3. Keep processors pure; no LLM on \`track()\`.
`;
}
