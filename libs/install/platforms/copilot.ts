import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { copySkillsTo } from '../skills.js';
import type { PlatformInstaller } from './types.js';
import { layerkitHookGuidance } from '../../hooks/guidance.js';

export const copilotInstaller: PlatformInstaller = {
  platform: 'copilot',
  install({ packageRoot, hooksEnabled }) {
    const home = process.env.COPILOT_HOME ?? join(process.env.HOME ?? '', '.copilot');
    const skillDirs = copySkillsTo(packageRoot, join(home, 'skills'));
    const hookConfigFiles: string[] = [];

    if (hooksEnabled) {
      const hooksDir = join(home, 'hooks');
      mkdirSync(hooksDir, { recursive: true });
      const hookFile = join(hooksDir, 'layerkit.json');
      writeFileSync(
        hookFile,
        JSON.stringify(
          {
            additionalContext: layerkitHookGuidance,
            stop: 'layerkit hook ingest --platform copilot',
          },
          null,
          2,
        ) + '\n',
      );
      hookConfigFiles.push(hookFile);
    }

    return {
      platform: 'copilot',
      skillDirs,
      hookConfigFiles,
      ruleFiles: [],
      notes: ['Copilot CLI skills under ~/.copilot/skills or $COPILOT_HOME/skills'],
    };
  },
};
