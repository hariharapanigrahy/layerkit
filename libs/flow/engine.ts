/**
 * Deterministic Integration Flow interpreter.
 * Supports: assign, call (responseInto / responseExtract / headersFromVars),
 * if, foreach, map_fields, privacy, route, end — structured conditions only.
 */
import { evalCondition, getPath } from '../privacy/conditions.js';
import { evaluatePrivacy } from '../privacy/gate.js';
import type { DomainEvent } from '../vendor-memory/map-engine.js';
import {
  FLOW_LIMITS,
  type AssignNode,
  type CallOpNode,
  type CallResult,
  type FlowExecuteOptions,
  type FlowExecutionResult,
  type FlowNode,
  type FlowWorkingMemory,
  type ForEachNode,
  type IfNode,
  type IntegrationFlow,
  type MapFieldsNode,
  type RouteNode,
} from './types.js';

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  // Allow paths like vars.x, payload.y, results.z
  const parts = path.split('.');
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    if (cur[p] == null || typeof cur[p] !== 'object') cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

/** Resolve path against working memory roots (payload, vars, results, event, loop). */
function resolveFromMemory(mem: FlowWorkingMemory, path: string): unknown {
  if (path === 'payload') return mem.payload;
  if (path === 'vars') return mem.vars;
  if (path === 'results') return mem.results;
  if (path === 'event') return mem.event;
  if (path.startsWith('payload.')) return getPath(mem.payload, path.slice('payload.'.length));
  if (path.startsWith('vars.')) return getPath(mem.vars, path.slice('vars.'.length));
  if (path.startsWith('results.')) return getPath(mem.results, path.slice('results.'.length));
  if (path.startsWith('event.')) return getPath(mem.event, path.slice('event.'.length));
  if (path.startsWith('loop.')) return getPath(mem.loop ?? {}, path.slice('loop.'.length));
  // bare path: try vars then payload then event
  const fromVars = getPath(mem.vars, path);
  if (fromVars !== undefined) return fromVars;
  const fromPayload = getPath(mem.payload, path);
  if (fromPayload !== undefined) return fromPayload;
  return getPath(mem.event, path);
}

function writeMemoryPath(mem: FlowWorkingMemory, path: string, value: unknown): void {
  if (path.startsWith('event.') || path === 'event') {
    throw new Error('flow_write_event_forbidden');
  }
  if (path.startsWith('payload.') || path === 'payload') {
    if (path === 'payload') {
      mem.payload = (value as Record<string, unknown>) ?? {};
      return;
    }
    setPath(mem.payload, path.slice('payload.'.length), value);
    return;
  }
  if (path.startsWith('vars.') || path === 'vars') {
    if (path === 'vars') {
      mem.vars = (value as Record<string, unknown>) ?? {};
      return;
    }
    setPath(mem.vars, path.slice('vars.'.length), value);
    return;
  }
  if (path.startsWith('results.') || path === 'results') {
    if (path === 'results') {
      mem.results = (value as Record<string, CallResult>) ?? {};
      return;
    }
    setPath(mem.results as unknown as Record<string, unknown>, path.slice('results.'.length), value);
    return;
  }
  // default under vars
  setPath(mem.vars, path, value);
}

function indexNodes(flow: IntegrationFlow): Map<string, FlowNode> {
  const m = new Map<string, FlowNode>();
  for (const n of flow.nodes) {
    m.set(n.id, n);
  }
  return m;
}

function runAssign(node: AssignNode, mem: FlowWorkingMemory): void {
  for (const s of node.set) {
    let value: unknown;
    if (s.from !== undefined) {
      value = resolveFromMemory(mem, s.from);
    } else {
      value = s.value;
    }
    writeMemoryPath(mem, s.path, deepClone(value));
  }
}

function runIf(node: IfNode, mem: FlowWorkingMemory): string | undefined {
  // Condition paths relative to working memory composite
  const root = {
    event: mem.event,
    payload: mem.payload,
    vars: mem.vars,
    results: mem.results,
    loop: mem.loop,
  };
  const ok = evalCondition(node.condition, root);
  return ok ? node.thenGoto : node.elseGoto;
}

function runRoute(node: RouteNode, mem: FlowWorkingMemory): string | undefined {
  const root = {
    event: mem.event,
    payload: mem.payload,
    vars: mem.vars,
    results: mem.results,
    loop: mem.loop,
  };
  for (const c of node.cases) {
    if (node.by === 'intent') {
      if (typeof c.when === 'string' && c.when === mem.event.intent) return c.goto;
    } else {
      const cond =
        typeof c.when === 'string'
          ? ({ op: 'eq' as const, path: 'event.intent', value: c.when })
          : c.when;
      if (evalCondition(cond, root)) return c.goto;
    }
  }
  return node.elseGoto;
}

function runMapFields(node: MapFieldsNode, mem: FlowWorkingMemory): void {
  const into = node.into || 'payload';
  let target: Record<string, unknown> =
    into === 'payload' ? mem.payload : ((resolveFromMemory(mem, into) as Record<string, unknown>) ?? {});
  if (typeof target !== 'object' || target == null) target = {};

  if (node.source === 'inline' && node.fields?.length) {
    for (const row of node.fields) {
      const raw = getPath(mem.event, row.domain);
      if (raw === undefined) continue;
      let out: unknown = raw;
      if (row.transform.type === 'constant') out = row.transform.value;
      if (row.transform.type === 'processor') {
        out = { __processor: row.transform.processorId, value: raw };
      }
      setPath(target, row.vendor, out);
    }
  } else if (node.source === 'map' || node.source === 'intent') {
    // When no inline fields, leave payload as-is (caller may have pre-mapped)
  }

  writeMemoryPath(mem, into, target);
}

function simulateCall(
  node: CallOpNode,
  mem: FlowWorkingMemory,
  opts: FlowExecuteOptions,
): { headers: Record<string, string>; payload: unknown; response: CallResult } {
  const payloadFrom = node.payloadFrom ?? 'payload';
  const payload = resolveFromMemory(mem, payloadFrom);

  const headers: Record<string, string> = {};
  for (const h of node.headersFromVars ?? []) {
    const raw = resolveFromMemory(mem, h.varPath);
    const str = raw == null ? '' : String(raw);
    headers[h.header] = (h.prefix ?? '') + str;
  }

  const sim = opts.simulatedResponses?.[node.operationId];
  const response: CallResult = {
    httpStatus: sim?.httpStatus ?? 200,
    body: sim?.body ?? { ok: true, operationId: node.operationId },
    headers: sim?.headers ?? { 'content-type': 'application/json' },
    simulated: true,
    errorClass: sim?.errorClass,
  };

  if (node.responseInto) {
    writeMemoryPath(mem, node.responseInto, response);
  }

  for (const ex of node.responseExtract ?? []) {
    // from is relative to response (e.g. body.access_token)
    const val = getPath(response, ex.from);
    writeMemoryPath(mem, ex.to, val);
  }

  return { headers, payload, response };
}

type RunStatus = {
  status: 'ok' | 'success' | 'skip' | 'abort' | 'failure';
  reason?: string;
  reasonCode?: string;
};

function runForeach(
  node: ForEachNode,
  mem: FlowWorkingMemory,
  byId: Map<string, FlowNode>,
  opts: FlowExecuteOptions,
  state: { nodesVisited: number; callLog: FlowExecutionResult['callLog'] },
): RunStatus {
  const itemsRaw = resolveFromMemory(mem, node.itemsPath);
  const items = Array.isArray(itemsRaw) ? itemsRaw : [];
  if (items.length > FLOW_LIMITS.maxForeachItems) {
    return {
      status: 'abort',
      reason: `foreach exceeds maxForeachItems (${FLOW_LIMITS.maxForeachItems})`,
      reasonCode: 'flow_foreach_limit',
    };
  }

  const collected: unknown[] = [];
  for (let i = 0; i < items.length; i++) {
    mem.loop = { name: node.as, index: i, item: items[i] };
    writeMemoryPath(mem, `vars.${node.as}`, items[i]);

    const bodyResult = runFrom(node.body, mem, byId, opts, state, /* depth */ 1);
    if (bodyResult.status === 'abort' || bodyResult.status === 'failure') {
      return bodyResult;
    }
    if (node.collect?.mode === 'array') {
      collected.push(deepClone(mem.payload));
    }
  }
  mem.loop = undefined;
  if (node.collect?.into) {
    writeMemoryPath(mem, node.collect.into, collected);
  }
  return { status: 'ok' };
}

function runFrom(
  startId: string,
  mem: FlowWorkingMemory,
  byId: Map<string, FlowNode>,
  opts: FlowExecuteOptions,
  state: { nodesVisited: number; callLog: FlowExecutionResult['callLog'] },
  depth: number,
): RunStatus {
  if (depth > FLOW_LIMITS.maxCallDepth) {
    return {
      status: 'abort',
      reason: `exceeded maxCallDepth (${FLOW_LIMITS.maxCallDepth})`,
      reasonCode: 'flow_max_depth',
    };
  }

  let current: string | undefined = startId;

  while (current) {
    state.nodesVisited += 1;
    if (state.nodesVisited > FLOW_LIMITS.maxNodes) {
      return {
        status: 'abort',
        reason: `exceeded maxNodes (${FLOW_LIMITS.maxNodes})`,
        reasonCode: 'flow_max_nodes',
      };
    }

    const node = byId.get(current);
    if (!node) {
      return {
        status: 'failure',
        reason: `unknown node id: ${current}`,
        reasonCode: 'flow_unknown_node',
      };
    }

    switch (node.type) {
      case 'assign':
        runAssign(node, mem);
        current = node.next;
        break;
      case 'if': {
        current = runIf(node, mem) ?? node.next;
        break;
      }
      case 'route': {
        current = runRoute(node, mem) ?? node.next;
        break;
      }
      case 'map_fields':
        runMapFields(node, mem);
        current = node.next;
        break;
      case 'call': {
        const callResult = simulateCall(node, mem, opts);
        state.callLog.push({
          operationId: node.operationId,
          headers: callResult.headers,
          payload: callResult.payload,
          response: callResult.response,
        });
        current = node.next;
        break;
      }
      case 'privacy': {
        const mode = opts.mode ?? 'dry_run';
        const policy = opts.privacyPolicy ?? null;
        const pr = evaluatePrivacy(
          mem.event as import('../privacy/types.js').PrivacyEvent,
          mem.payload,
          policy,
          mode,
        );
        if (pr.action === 'fail') {
          return {
            status: 'failure',
            reason: pr.reasonCode,
            reasonCode: pr.reasonCode,
          };
        }
        if (pr.action === 'drop') {
          return {
            status: 'skip',
            reason: pr.reasonCode,
            reasonCode: pr.reasonCode,
          };
        }
        if (pr.payload) mem.payload = pr.payload;
        current = node.next;
        break;
      }
      case 'foreach': {
        const fr = runForeach(node, mem, byId, opts, state);
        if (fr.status !== 'ok') return fr;
        current = node.nextAfter ?? node.next;
        break;
      }
      case 'fanout_branches': {
        // Sequential settle of branches (deterministic; no true parallelism in TS dry-run)
        for (const branchEntry of node.branches) {
          const branchMem: FlowWorkingMemory = {
            event: mem.event,
            payload: deepClone(mem.payload),
            vars: deepClone(mem.vars),
            results: deepClone(mem.results),
            loop: mem.loop,
          };
          const br = runFrom(branchEntry, branchMem, byId, opts, state, depth + 1);
          setPath(
            mem.results as unknown as Record<string, unknown>,
            `fanout.${branchEntry}`,
            { status: br.status, reason: br.reason, payload: branchMem.payload, results: branchMem.results },
          );
          if (node.join === 'all' && (br.status === 'failure' || br.status === 'abort')) {
            return {
              status: 'failure',
              reason: `fanout_branch_failed:${branchEntry}`,
              reasonCode: `fanout_branch_failed:${branchEntry}`,
            };
          }
        }
        current = node.next;
        break;
      }
      case 'end':
        if (node.status === 'success') return { status: 'success', reason: node.reason };
        if (node.status === 'skip') {
          return { status: 'skip', reason: node.reason, reasonCode: node.reason };
        }
        return { status: 'abort', reason: node.reason, reasonCode: node.reason ?? 'flow_abort' };
      default: {
        const _n: never = node;
        void _n;
        return { status: 'failure', reason: 'unknown_node_type', reasonCode: 'flow_unknown_node_type' };
      }
    }
  }

  return { status: 'success' };
}

/**
 * Execute an IntegrationFlow against a domain event.
 * Calls are always simulated in this engine (delivery layer owns real HTTP later).
 */
export function executeFlow(
  flow: IntegrationFlow,
  event: DomainEvent,
  opts: FlowExecuteOptions = {},
): FlowExecutionResult {
  const byId = indexNodes(flow);
  if (!byId.has(flow.entry)) {
    const mem: FlowWorkingMemory = {
      event,
      payload: opts.initialPayload ? deepClone(opts.initialPayload) : {},
      vars: {},
      results: {},
    };
    return {
      status: 'failure',
      reason: `entry node missing: ${flow.entry}`,
      reasonCode: 'flow_entry_missing',
      memory: mem,
      nodesVisited: 0,
      callLog: [],
    };
  }

  const mem: FlowWorkingMemory = {
    event,
    payload: opts.initialPayload ? deepClone(opts.initialPayload) : {},
    vars: {},
    results: {},
  };
  const state = { nodesVisited: 0, callLog: [] as FlowExecutionResult['callLog'] };
  const result = runFrom(flow.entry, mem, byId, opts, state, 0);

  return {
    status:
      result.status === 'ok'
        ? 'success'
        : result.status === 'success'
          ? 'success'
          : result.status === 'skip'
            ? 'skip'
            : result.status === 'abort'
              ? 'abort'
              : 'failure',
    reason: result.reason,
    reasonCode: result.reasonCode,
    memory: mem,
    nodesVisited: state.nodesVisited,
    callLog: state.callLog,
  };
}
