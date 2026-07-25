import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { copySkillsTo } from '../skills.js';
import type { PlatformInstaller } from './types.js';
import { layerkitHookGuidance } from '../../hooks/guidance.js';

export const cursorInstaller: PlatformInstaller = {
  platform: 'cursor',
  install({ packageRoot, repoRoot, hooksEnabled }) {
    const home = process.env.CURSOR_HOME ?? join(process.env.HOME ?? '', '.cursor');
    const skillDirs = copySkillsTo(packageRoot, join(home, 'skills'));
    const hookConfigFiles: string[] = [];
    const ruleFiles: string[] = [];

    // Cursor: always-applied project rule (beforeSubmitPrompt cannot inject context)
    const rulesDir = join(repoRoot, '.cursor', 'rules');
    mkdirSync(rulesDir, { recursive: true });
    let rulePath = join(rulesDir, 'layerkit.mdc');
    if (existsSync(rulePath)) {
      // never overwrite user-authored layerkit.mdc
      rulePath = join(rulesDir, 'layerkit-1.mdc');
    }
    writeFileSync(
      rulePath,
      `---
description: Layerkit multi-vendor data-layer agent guidance
alwaysApply: true
---

${layerkitHookGuidance}
`,
      'utf8',
    );
    ruleFiles.push(rulePath);

    if (hooksEnabled) {
      const hooksPath = join(home, 'hooks.json');
      writeFileSync(
        hooksPath,
        JSON.stringify(
          {
            version: 1,
            hooks: {
              beforeSubmitPrompt: [{ command: 'layerkit hook ingest --platform cursor' }],
              stop: [{ command: 'layerkit hook ingest --platform cursor' }],
            },
          },
          null,
          2,
        ) + '\n',
      );
      hookConfigFiles.push(hooksPath);
    }

    return {
      platform: 'cursor',
      skillDirs,
      hookConfigFiles,
      ruleFiles,
      notes: [
        'Cursor skills under ~/.cursor/skills (or $CURSOR_HOME/skills)',
        'Reload Cursor if the new project rule does not appear',
      ],
    };
  },
};
