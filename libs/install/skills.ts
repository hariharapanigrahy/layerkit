import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const SKILL_NAMES = [
  'layerkit-bootstrap',
  'layerkit-discover-data-layer',
  'layerkit-inventory-surfaces',
  'layerkit-research-vendor',
  'layerkit-design-integration',
  'layerkit-author-map',
  'layerkit-author-processor',
  'layerkit-design-flow',
  'layerkit-privacy-review',
  'layerkit-deletion-first',
  'layerkit-align-client-style',
  'layerkit-source-edit-client',
  'layerkit-fix-from-dry-run',
  'layerkit-checker-assist',
  'layerkit-session-handoff',
  'layerkit-orchestrate-integration',
  'layerkit-multi-agent',
] as const;

export function listPackagedSkills(packageRoot: string): string[] {
  const dir = join(packageRoot, 'skills');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => existsSync(join(dir, name, 'SKILL.md')));
}

export interface CopySkillsResult {
  /** Absolute paths of packaged skill dirs written under destRoot. */
  paths: string[];
  /** How many packaged skill dirs already existed and were replaced. */
  refreshed: number;
}

/**
 * Install packaged skills into an agent skill root.
 *
 * Always refreshes packaged skill directories so reinstall replaces stale
 * SKILL.md content (for example older docs that referenced removed CLI paths).
 * Packaged Layerkit skills are source of truth; do not edit them in place.
 * Non-packaged skill directories under destRoot are left untouched.
 */
export function copySkillsTo(packageRoot: string, destRoot: string): string[] {
  return copySkillsWithStats(packageRoot, destRoot).paths;
}

/** Same as {@link copySkillsTo} but also reports how many existing dirs were replaced. */
export function copySkillsWithStats(packageRoot: string, destRoot: string): CopySkillsResult {
  mkdirSync(destRoot, { recursive: true });
  const paths: string[] = [];
  let refreshed = 0;
  for (const name of listPackagedSkills(packageRoot)) {
    const from = join(packageRoot, 'skills', name);
    const to = join(destRoot, name);
    if (existsSync(to)) refreshed += 1;
    rmSync(to, { recursive: true, force: true });
    cpSync(from, to, { recursive: true });
    paths.push(to);
  }
  return { paths, refreshed };
}
