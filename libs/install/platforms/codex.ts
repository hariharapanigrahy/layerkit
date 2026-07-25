import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { copySkillsTo } from '../skills.js';
import type { PlatformInstaller } from './types.js';
import { layerkitHookGuidance } from '../../hooks/guidance.js';

export const codexInstaller: PlatformInstaller = {
  platform: 'codex',
  install({ packageRoot, hooksEnabled }) {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
    const skillDir = join(home, '.codex', 'skills');
    const skillDirs = copySkillsTo(packageRoot, skillDir);
    const hookConfigFiles: string[] = [];
    const notes: string[] = [];

    if (hooksEnabled) {
      const hooksDir = join(home, '.codex', 'hooks');
      mkdirSync(hooksDir, { recursive: true });
      const hookFile = join(hooksDir, 'layerkit.json');
      writeFileSync(
        hookFile,
        JSON.stringify(
          {
            name: 'layerkit',
            events: ['UserPromptSubmit', 'Stop'],
            guidance: layerkitHookGuidance,
            worker: 'layerkit hook worker',
          },
          null,
          2,
        ) + '\n',
      );
      hookConfigFiles.push(hookFile);
      notes.push('Codex hooks installed under ~/.codex/hooks/layerkit.json');
    }

    return {
      platform: 'codex',
      skillDirs,
      hookConfigFiles,
      ruleFiles: [],
      notes,
    };
  },
  sessionIdFromSourceRef(ref) {
    if (ref.startsWith('codex:')) return ref.slice('codex:'.length);
    return undefined;
  },
};
