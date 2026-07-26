/**
 * Resolve IntegrationFlow from inline map.flow or on-disk flowRef.
 * Store writes flows/{vendor}.json and sets map.flowRef — track must load it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IntegrationFlow } from '../flow/types.js';
import type { VendorMap } from '../domain/types.js';

type MapWithFlow = VendorMap & {
  flow?: IntegrationFlow;
  flowRef?: string;
};

function readFlowFile(path: string): IntegrationFlow | null {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as IntegrationFlow | { flow?: IntegrationFlow };
    if (raw && typeof raw === 'object' && 'nodes' in raw && Array.isArray((raw as IntegrationFlow).nodes)) {
      return raw as IntegrationFlow;
    }
    if (raw && typeof raw === 'object' && 'flow' in raw && raw.flow && typeof raw.flow === 'object') {
      return raw.flow as IntegrationFlow;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Prefer inline flow; else load `{projectDir}/flows/{flowRef|vendor}.json`.
 */
export function resolveMapFlow(
  map: MapWithFlow,
  projectDir?: string,
): IntegrationFlow | undefined {
  if (map.flow && Array.isArray(map.flow.nodes)) {
    return map.flow;
  }
  if (!projectDir) return undefined;

  const candidates: string[] = [];
  if (map.flowRef?.trim()) {
    candidates.push(map.flowRef.trim());
  }
  candidates.push(map.vendor);

  const flowsDir = join(projectDir, 'flows');
  for (const id of candidates) {
    const path = join(flowsDir, `${id}.json`);
    if (!existsSync(path)) continue;
    const flow = readFlowFile(path);
    if (flow) return flow;
  }
  return undefined;
}
