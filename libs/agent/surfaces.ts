/**
 * Package language / surface inventory for multi-lang heals.
 * Agent fills the inventory (skills instruct); Layerkit validates completeness
 * before source-edit complete and handoff / PR.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const SURFACE_INVENTORY_REL = 'runbooks/surface-inventory.json';

export type SurfaceStatus = 'pending' | 'updated' | 'residual';

export interface SurfaceLanguage {
  /** Stable id: node, python, ruby, php, java, go, csharp, nextjs, client, … */
  id: string;
  /** Package-relative roots where this language lives */
  roots: string[];
  status: SurfaceStatus;
  /** Paths edited when status=updated */
  paths?: string[];
  /** Required when status=residual */
  residual?: string;
}

export interface SurfaceInventory {
  schemaVersion: 1;
  package?: string;
  languages: SurfaceLanguage[];
  updatedAt?: string;
  notes?: string;
}

export function surfaceInventoryPath(projectDir: string): string {
  return join(projectDir, 'memory', SURFACE_INVENTORY_REL);
}

export function loadSurfaceInventory(projectDir: string): SurfaceInventory | null {
  const path = surfaceInventoryPath(projectDir);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as SurfaceInventory;
  } catch {
    throw new Error(
      `surface_inventory_invalid: cannot parse ${SURFACE_INVENTORY_REL} — fix JSON or re-run surfaces step`,
    );
  }
}

export function saveSurfaceInventory(projectDir: string, inv: SurfaceInventory): string {
  const path = surfaceInventoryPath(projectDir);
  mkdirSync(dirname(path), { recursive: true });
  const body: SurfaceInventory = {
    ...inv,
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  return path;
}

export function assertValidSurfaceInventory(inv: SurfaceInventory): void {
  if (inv.schemaVersion !== 1) {
    throw new Error(`surface_inventory_invalid: schemaVersion must be 1`);
  }
  if (!Array.isArray(inv.languages) || inv.languages.length < 1) {
    throw new Error(
      'surface_inventory_empty: list every language/surface the package supports (≥1). ' +
        'Example: node, python, ruby, php, java, go, nextjs, client.',
    );
  }
  const ids = new Set<string>();
  for (const lang of inv.languages) {
    if (!lang.id?.trim()) {
      throw new Error('surface_inventory_invalid: language.id required');
    }
    if (ids.has(lang.id)) {
      throw new Error(`surface_inventory_invalid: duplicate language id ${lang.id}`);
    }
    ids.add(lang.id);
    if (!Array.isArray(lang.roots) || lang.roots.length < 1) {
      throw new Error(
        `surface_inventory_invalid: language ${lang.id} needs roots[] (package-relative paths)`,
      );
    }
    if (!['pending', 'updated', 'residual'].includes(lang.status)) {
      throw new Error(
        `surface_inventory_invalid: language ${lang.id} status must be pending|updated|residual`,
      );
    }
    if (lang.status === 'residual' && !lang.residual?.trim()) {
      throw new Error(
        `surface_inventory_invalid: language ${lang.id} status=residual requires residual explanation`,
      );
    }
    if (lang.status === 'updated' && !(lang.paths && lang.paths.length > 0)) {
      throw new Error(
        `surface_inventory_invalid: language ${lang.id} status=updated requires paths[] of files edited`,
      );
    }
  }
}

/**
 * Parse inventory JSON from evidence bodies, or load from standard session path.
 * Prefer explicit JSON fence or whole-file JSON.
 */
export function resolveSurfaceInventory(
  projectDir: string,
  evidenceBodies: string[],
): SurfaceInventory {
  for (const body of evidenceBodies) {
    const fenced = body.match(/```json\s*([\s\S]*?)```/i);
    const raw = fenced?.[1]?.trim() || body.trim();
    if (raw.startsWith('{') && raw.includes('languages')) {
      try {
        const inv = JSON.parse(raw) as SurfaceInventory;
        assertValidSurfaceInventory(inv);
        saveSurfaceInventory(projectDir, inv);
        return inv;
      } catch {
        /* try next */
      }
    }
  }
  const fromDisk = loadSurfaceInventory(projectDir);
  if (fromDisk) {
    assertValidSurfaceInventory(fromDisk);
    return fromDisk;
  }
  throw new Error(
    'surface_inventory_required: write memory/runbooks/surface-inventory.json (or JSON in evidence) ' +
      'listing languages[] with id, roots[], status=pending|updated|residual. ' +
      'Agent invents the list from package layout (source:code); Layerkit validates completeness later.',
  );
}

/** surfaces mark-done: inventory present, languages listed (status may still be pending). */
export function assertSurfacesStepComplete(
  projectDir: string,
  evidenceBodies: string[],
): SurfaceInventory {
  const inv = resolveSurfaceInventory(projectDir, evidenceBodies);
  // At surfaces step, pending is OK — agent only inventories; schema already validated.
  saveSurfaceInventory(projectDir, inv);
  return inv;
}

/** source-edit / handoff: every language updated or residual (no pending). */
export function assertAllSurfacesResolved(projectDir: string): SurfaceInventory {
  const inv = loadSurfaceInventory(projectDir);
  if (!inv) {
    throw new Error(
      'surface_inventory_missing: complete the surfaces step first ' +
        `(write memory/${SURFACE_INVENTORY_REL} with package languages). ` +
        'Without inventory Layerkit cannot enforce multi-lang completeness.',
    );
  }
  assertValidSurfaceInventory(inv);
  const pending = inv.languages.filter((l) => l.status === 'pending');
  if (pending.length) {
    throw new Error(
      `surfaces_incomplete: still pending: ${pending.map((p) => p.id).join(', ')}. ` +
        `Update each language (status=updated + paths[]) or status=residual + residual: why. ` +
        `Then re-run source-edit until none are pending — or do not open PR yet.`,
    );
  }
  return inv;
}
