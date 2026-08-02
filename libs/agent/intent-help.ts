/**
 * Intentional Layerkit entry (BMAD-style help).
 * Rails apply only when the user/agent opts into integrate/heal — not all coding work.
 */

/** User-message prefixes that declare integration intent. */
export const LAYERKIT_INTENT_PREFIXES = [
  'layerkit:',
  '/layerkit',
  '@layerkit',
] as const;

/**
 * True when user text looks like intentional Layerkit integrate/heal work.
 * Deterministic; used for docs/hooks guidance — not for blocking non-matching work.
 */
export function looksLikeLayerkitIntent(userText: string): boolean {
  const t = userText.trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  for (const p of LAYERKIT_INTENT_PREFIXES) {
    if (lower.startsWith(p.toLowerCase())) return true;
  }
  // Explicit product verbs (still optional entry; agent should start session)
  if (
    /\b(layerkit\s+agent\s+start|contract\s+heal|vendor\s+map|full\s+integrate)\b/i.test(t)
  ) {
    return true;
  }
  if (/\b(integrate|heal)\b/i.test(t) && /\b(layerkit|vendor|openapi|stripe|shopify)\b/i.test(t)) {
    return true;
  }
  return false;
}

/** Full orientation text for `layerkit help` / `layerkit agent help`. */
export function formatLayerkitHelp(opts?: {
  projectDir?: string;
  nextStepLine?: string;
  sessionOpen?: boolean;
}): string {
  const lines: string[] = [
    'layerkit help — intentional integration mode (not ambient law)',
    '',
    '## When rails apply',
    'Layerkit fail-closed process applies ONLY when the user intentionally asks for',
    'vendor integrate / contract heal / map work. Unrelated coding is free agent work.',
    '',
    '## How the user opts in (pick one)',
    '  layerkit: heal stripe to latest API in this package',
    '  /layerkit integrate vendor X',
    '  @layerkit contract update',
    '  layerkit agent start --mode full|heal --vendor <v>',
    '',
    '## Agent entry (required for integrate/heal claims)',
    '  1. layerkit help                 # this screen',
    '  2. layerkit agent start [--mode full|heal] --vendor <v>',
    '  3. layerkit agent next            # writes skill packet; follow THAT skill only',
    '  4. layerkit agent mark-done --step <id> --evidence <path>',
    '  5. repeat next/mark-done until handoff',
    '',
    '## Forbidden while claiming Layerkit (session open or layerkit: intent)',
    '  - Freestyle production edits without the current skill packet',
    '  - Pin-only apiVersion/SDK bumps labeled full integrate / contract heal',
    '  - mark-done out of order or with empty stub evidence',
    '  - Skipping agent start and inventing maps',
    '',
    '## Out of scope (do NOT force Layerkit)',
    '  - UI copy, refactors, tests, docs unrelated to vendor contract',
    '  - General app features without layerkit: / integrate-heal intent',
    '',
    '## Exit / reset session',
    '  layerkit agent status',
    '  layerkit agent start --force-reset   # wipe step markers (maps/memory kept) if supported',
    '',
    '## Skills (order)',
    '  discover → research → design → author (map) → privacy → deletion-first → source-edit → handoff',
    '  Lead skill: layerkit-orchestrate-integration',
    '',
    '## CLI rails (artifacts only)',
    '  proposal validate|submit|apply   map show|validate   memory append   doctor',
    '',
  ];

  if (opts?.projectDir) {
    lines.push(`## This workspace`);
    lines.push(`  projectDir: ${opts.projectDir}`);
    if (opts.sessionOpen) {
      lines.push(`  session: OPEN`);
      if (opts.nextStepLine) lines.push(`  ${opts.nextStepLine}`);
      lines.push('  → Run: layerkit agent next');
    } else {
      lines.push('  session: closed (no pipeline markers)');
      lines.push('  → For integrate/heal: layerkit agent start --vendor <v>');
    }
    lines.push('');
  }

  lines.push('Cheat sheet: layerkit cheatsheet');
  lines.push('Docs: skills/*/SKILL.md');
  return lines.join('\n');
}

/** One-line hook / AGENTS reminder (keep short). */
export const layerkitIntentHookLine =
  'If user message starts with layerkit: or asks vendor integrate/heal via Layerkit: run `layerkit help` then `layerkit agent start` and follow skill packets. Do not apply Layerkit rails to unrelated tasks. Do not freestyle pin-only "full integrate" PRs.';
