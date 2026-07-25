import type { AgentRunner, AgentRunRequest, AgentRunResult } from './types.js';

/** Placeholder until live agent subprocess integration is wired for evals. */
export const stubRunner: AgentRunner = {
  platform: 'codex',
  async run(req: AgentRunRequest): Promise<AgentRunResult> {
    return {
      exitCode: 0,
      stdout: `[stub] would run on ${req.platform}: ${req.prompt.slice(0, 80)}…`,
      stderr: '',
      durationMs: 0,
    };
  },
};
