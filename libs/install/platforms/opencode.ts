import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { copySkillsTo } from '../skills.js';
import type { PlatformInstaller } from './types.js';
import { layerkitHookGuidance } from '../../hooks/guidance.js';

export const opencodeInstaller: PlatformInstaller = {
  platform: 'opencode',
  install({ packageRoot, hooksEnabled }) {
    const home = process.env.HOME ?? '';
    const skillDirs = copySkillsTo(packageRoot, join(home, '.config', 'opencode', 'skills'));
    const hookConfigFiles: string[] = [];

    if (hooksEnabled) {
      const path = join(home, '.config', 'opencode', 'layerkit-hooks.json');
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(
        path,
        JSON.stringify({ guidance: layerkitHookGuidance, events: ['prompt', 'stop'] }, null, 2) +
          '\n',
      );
      hookConfigFiles.push(path);
    }

    return {
      platform: 'opencode',
      skillDirs,
      hookConfigFiles,
      ruleFiles: [],
      notes: ['OpenCode skills under ~/.config/opencode/skills'],
    };
  },
};
