import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { copySkillsTo } from '../skills.js';
import type { PlatformInstaller } from './types.js';
import { layerkitHookGuidance } from '../../hooks/guidance.js';

export const claudeInstaller: PlatformInstaller = {
  platform: 'claude',
  install({ packageRoot, repoRoot, hooksEnabled }) {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
    const skillDirs = copySkillsTo(packageRoot, join(home, '.claude', 'skills'));
    const hookConfigFiles: string[] = [];
    const ruleFiles: string[] = [];

    const claudeMd = join(repoRoot, 'CLAUDE.md');
    appendOnce(claudeMd, `\n## Layerkit\n\n${layerkitHookGuidance}\n`);
    ruleFiles.push(claudeMd);

    if (hooksEnabled) {
      const hooksPath = join(home, '.claude', 'hooks', 'layerkit.json');
      mkdirSync(join(hooksPath, '..'), { recursive: true });
      writeFileSync(
        hooksPath,
        JSON.stringify({ events: ['UserPromptSubmit', 'Stop'], guidance: layerkitHookGuidance }, null, 2) +
          '\n',
      );
      hookConfigFiles.push(hooksPath);
    }

    return {
      platform: 'claude',
      skillDirs,
      hookConfigFiles,
      ruleFiles,
      notes: ['Claude Code skills under ~/.claude/skills'],
    };
  },
};

function appendOnce(path: string, block: string): void {
  let existing = '';
  if (existsSync(path)) {
    existing = readFileSync(path, 'utf8');
    if (existing.includes('Layerkit is an agent-first')) return;
  }
  writeFileSync(path, existing + block, 'utf8');
}
