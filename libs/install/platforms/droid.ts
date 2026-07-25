import { join } from 'node:path';
import { copySkillsTo } from '../skills.js';
import type { PlatformInstaller } from './types.js';

export const droidInstaller: PlatformInstaller = {
  platform: 'factory-droid',
  install({ packageRoot }) {
    const home = process.env.HOME ?? '';
    const skillDirs = copySkillsTo(packageRoot, join(home, '.factory', 'skills'));
    return {
      platform: 'factory-droid',
      skillDirs,
      hookConfigFiles: [],
      ruleFiles: [],
      notes: ['Factory Droid skills under ~/.factory/skills'],
    };
  },
};
