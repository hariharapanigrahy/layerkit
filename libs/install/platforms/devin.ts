import { join } from 'node:path';
import { copySkillsTo } from '../skills.js';
import type { PlatformInstaller } from './types.js';

export const devinInstaller: PlatformInstaller = {
  platform: 'devin',
  install({ packageRoot }) {
    const home = process.env.HOME ?? '';
    const skillDirs = copySkillsTo(packageRoot, join(home, '.devin', 'skills'));
    return {
      platform: 'devin',
      skillDirs,
      hookConfigFiles: [],
      ruleFiles: [],
      notes: ['Devin skills under ~/.devin/skills'],
    };
  },
};
