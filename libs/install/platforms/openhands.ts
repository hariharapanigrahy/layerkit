import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { copySkillsTo } from '../skills.js';
import type { PlatformInstaller } from './types.js';
import { layerkitHookGuidance } from '../../hooks/guidance.js';

/** OpenHands: repo-local skills + hooks. */
export const openhandsInstaller: PlatformInstaller = {
  platform: 'openhands',
  install({ packageRoot, repoRoot, hooksEnabled }) {
    const skillDirs = copySkillsTo(packageRoot, join(repoRoot, '.agents', 'skills'));
    const hookConfigFiles: string[] = [];

    if (hooksEnabled) {
      const hooksDir = join(repoRoot, '.openhands');
      mkdirSync(hooksDir, { recursive: true });
      const hookFile = join(hooksDir, 'hooks.json');
      writeFileSync(
        hookFile,
        JSON.stringify(
          {
            UserPromptSubmit: { additionalContext: layerkitHookGuidance },
            Stop: { command: 'layerkit hook ingest --platform openhands' },
          },
          null,
          2,
        ) + '\n',
      );
      hookConfigFiles.push(hookFile);
    }

    return {
      platform: 'openhands',
      skillDirs,
      hookConfigFiles,
      ruleFiles: [],
      notes: [
        'OpenHands skills at .agents/skills/ (repo-local)',
        'Trust repo hooks for Layerkit agent reminders',
      ],
    };
  },
};
