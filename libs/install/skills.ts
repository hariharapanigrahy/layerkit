import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const SKILL_NAMES = [
  'layerkit-bootstrap',
  'layerkit-discover-data-layer',
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

/**
 * Install packaged skills from the **local package** (npm supply chain).
 * Always refreshes existing packaged skill dirs so reinstall is not stuck on stale SKILL.md.
 * Does not touch non-packaged skill directories under destRoot.
 */
export function copySkillsTo(packageRoot: string, destRoot: string): string[] {
  mkdirSync(destRoot, { recursive: true });
  const installed: string[] = [];
  for (const name of listPackagedSkills(packageRoot)) {
    const from = join(packageRoot, 'skills', name);
    const to = join(destRoot, name);
    if (existsSync(to)) {
      rmSync(to, { recursive: true, force: true });
    }
    cpSync(from, to, { recursive: true });
    installed.push(to);
  }
  return installed;
}
