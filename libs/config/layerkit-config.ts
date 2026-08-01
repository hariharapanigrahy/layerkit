import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { InstallPlatform } from '../install/paths.js';

export interface MakerCheckerConfig {
  /** Checker must be distinct from maker (default true) */
  requireDistinctChecker: boolean;
  /** Require privacy reviewer when proposal is PII-affecting (default true) */
  requirePrivacyReviewForPii: boolean;
  /** Allow maker to self-approve (default false) */
  allowSelfApprove: boolean;
  /**
   * When true, apply accepts pending|validated|approved after structural validate
   * (emits LEGACY_APPLY warning). Default **false** (strict): apply requires
   * `ready_to_apply` after submit → validate → approve.
   * Re-enable legacy: set makerChecker.legacyApplyWithoutApprove=true in
   * project.json or ~/.layerkit/config.json.
   */
  legacyApplyWithoutApprove: boolean;
}

export interface LayerkitConfig {
  version: 1 | 2;
  defaultPlatform?: InstallPlatform;
  hooksEnabledDefault: boolean;
  mapRemindersDefault: boolean;
  /** Default offered on install if user presses enter; still overridable per project */
  defaultProjectDir?: string;
  makerChecker: MakerCheckerConfig;
  dryRun: {
    executeProcessors: boolean;
  };
  session: {
    stopThreshold: number;
    timeThresholdMinutes: number;
  };
}

export const DEFAULT_MAKER_CHECKER: MakerCheckerConfig = {
  requireDistinctChecker: true,
  requirePrivacyReviewForPii: true,
  allowSelfApprove: false,
  /** Strict by default — pin true in project/user config to restore legacy apply. */
  legacyApplyWithoutApprove: false,
};

export const DEFAULT_CONFIG: LayerkitConfig = {
  version: 1,
  hooksEnabledDefault: true,
  mapRemindersDefault: true,
  defaultProjectDir: '.layerkit',
  makerChecker: { ...DEFAULT_MAKER_CHECKER },
  dryRun: {
    executeProcessors: true,
  },
  session: {
    stopThreshold: 3,
    timeThresholdMinutes: 30,
  },
};

export function layerkitHome(): string {
  return join(homedir(), '.layerkit');
}

export function layerkitConfigPath(): string {
  return join(layerkitHome(), 'config.json');
}

export function ensureLayerkitConfig(path = layerkitConfigPath()): LayerkitConfig {
  mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path)) {
    writeFileSync(path, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
    return {
      ...DEFAULT_CONFIG,
      makerChecker: { ...DEFAULT_MAKER_CHECKER },
      dryRun: { ...DEFAULT_CONFIG.dryRun },
      session: { ...DEFAULT_CONFIG.session },
    };
  }
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<LayerkitConfig>;
  return {
    ...DEFAULT_CONFIG,
    ...parsed,
    makerChecker: {
      ...DEFAULT_MAKER_CHECKER,
      ...parsed.makerChecker,
    },
    dryRun: {
      ...DEFAULT_CONFIG.dryRun,
      ...parsed.dryRun,
    },
    session: { ...DEFAULT_CONFIG.session, ...parsed.session },
  };
}
