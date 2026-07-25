/**
 * Install platforms — mirrors greplica's multi-agent surface.
 * @see https://github.com/Autoloops/greplica libs/install/paths.ts
 */

export const installPlatforms = [
  'codex',
  'claude',
  'cursor',
  'copilot',
  'opencode',
  'openhands',
  'factory-droid',
  'antigravity',
] as const;

export type InstallPlatform = (typeof installPlatforms)[number];

export const installPlatformUsage = installPlatforms.join('|');

export function isInstallPlatform(value: string): value is InstallPlatform {
  return (installPlatforms as readonly string[]).includes(value);
}

export function platformDisplayName(platform: InstallPlatform): string {
  switch (platform) {
    case 'codex':
      return 'Codex';
    case 'claude':
      return 'Claude Code';
    case 'cursor':
      return 'Cursor';
    case 'copilot':
      return 'GitHub Copilot CLI';
    case 'opencode':
      return 'OpenCode';
    case 'openhands':
      return 'OpenHands';
    case 'factory-droid':
      return 'Factory Droid';
    case 'antigravity':
      return 'Antigravity';
  }
}
