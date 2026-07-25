import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const SKILL_NAMES = [
  'layerkit-bootstrap',
  'layerkit-discover-data-layer',
  'layerkit-research-vendor',
  'layerkit-author-processor',
  'layerkit-design-flow',
  'layerkit-privacy-review',
  'layerkit-generate-java',
  'layerkit-update-maps',
  'layerkit-checker-assist',
] as const;

export function listPackagedSkills(packageRoot: string): string[] {
  const dir = join(packageRoot, 'skills');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => existsSync(join(dir, name, 'SKILL.md')));
}

export function copySkillsTo(packageRoot: string, destRoot: string): string[] {
  mkdirSync(destRoot, { recursive: true });
  const installed: string[] = [];
  for (const name of listPackagedSkills(packageRoot)) {
    const from = join(packageRoot, 'skills', name);
    const to = join(destRoot, name);
    cpSync(from, to, { recursive: true });
    installed.push(to);
  }
  return installed;
}
