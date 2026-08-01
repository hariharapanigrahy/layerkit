import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { layerkitHookGuidance } from '../../hooks/guidance.js';
import { copySkillsTo } from '../skills.js';
import type { PlatformInstaller } from './types.js';

export const windsurfInstaller: PlatformInstaller = {
  platform: 'windsurf',
  install({ packageRoot, hooksEnabled }) {
    const home = process.env.HOME ?? '';
    const skillDirs = copySkillsTo(packageRoot, join(home, '.windsurf', 'skills'));
    const ruleFiles: string[] = [];

    if (hooksEnabled) {
      const path = join(home, '.windsurf', 'rules', 'layerkit.md');
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, `${layerkitHookGuidance}\n`, 'utf8');
      ruleFiles.push(path);
    }

    return {
      platform: 'windsurf',
      skillDirs,
      hookConfigFiles: [],
      ruleFiles,
      notes: ['Windsurf skills under ~/.windsurf/skills'],
    };
  },
};
