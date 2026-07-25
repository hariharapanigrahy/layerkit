import { join } from 'node:path';
import { copySkillsTo } from '../skills.js';
import type { PlatformInstaller } from './types.js';

export const antigravityInstaller: PlatformInstaller = {
  platform: 'antigravity',
  install({ packageRoot }) {
    const home = process.env.HOME ?? '';
    const skillDirs = copySkillsTo(packageRoot, join(home, '.antigravity', 'skills'));
    return {
      platform: 'antigravity',
      skillDirs,
      hookConfigFiles: [],
      ruleFiles: [],
      notes: ['Antigravity skills under ~/.antigravity/skills'],
    };
  },
};
