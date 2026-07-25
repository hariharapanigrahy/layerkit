/**
 * Extension point for offline eval agent runs (greplica libs/agent-runner analog).
 * Wire Codex/OpenCode/OpenHands subprocess runners here when scoring vendor-research-plan cases live.
 */
export type AgentPlatformRunner = 'codex' | 'opencode' | 'openhands';

export interface AgentRunRequest {
  platform: AgentPlatformRunner;
  prompt: string;
  cwd: string;
  timeoutMs?: number;
}

export interface AgentRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface AgentRunner {
  platform: AgentPlatformRunner;
  run(req: AgentRunRequest): Promise<AgentRunResult>;
}
