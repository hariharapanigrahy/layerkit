/**
 * Execute resolved processors (builtins + agent pipelines).
 * Pure: no network, no filesystem after resolve.
 */
import { executeBuiltin } from './builtins.js';
import type { StrategyRegistry } from './registry.js';
import {
  isBuiltinOp,
  ProcessorUnresolvedError,
  type ProcessorImpl,
} from './types.js';

export interface ExecuteOptions {
  /** When true (default), unresolved → throw ProcessorUnresolvedError */
  failClosed?: boolean;
}

/**
 * Execute a ProcessorImpl tree against a value, resolving nested builtins
 * and agent refs through the registry.
 */
export function executeImpl(
  impl: ProcessorImpl,
  value: unknown,
  registry: StrategyRegistry,
  opts?: ExecuteOptions,
): unknown {
  const failClosed = opts?.failClosed !== false;

  switch (impl.type) {
    case 'builtin': {
      if (!isBuiltinOp(impl.op)) {
        if (failClosed) throw new ProcessorUnresolvedError(`builtin.${impl.op}`);
        return value;
      }
      return executeBuiltin(impl.op, value, impl.params);
    }
    case 'pipeline': {
      let cur = value;
      for (const step of impl.steps ?? []) {
        cur = executeImpl(step, cur, registry, opts);
      }
      return cur;
    }
    case 'java_ref':
      // TS dry-run / eval cannot run Java refs
      if (failClosed) {
        throw new ProcessorUnresolvedError(
          `java_ref:${impl.className}.${impl.method}`,
          `processor_unresolved: java_ref ${impl.className}.${impl.method} not executable in TS dry-run`,
        );
      }
      return value;
    case 'ts_module':
      if (failClosed) {
        throw new ProcessorUnresolvedError(
          `ts_module:${impl.exportName}`,
          `processor_unresolved: ts_module ${impl.exportName} not wired`,
        );
      }
      return value;
    default: {
      const _exhaustive: never = impl;
      throw new Error(`unknown ProcessorImpl: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/**
 * Resolve processorId via registry and execute on value.
 * Throws ProcessorUnresolvedError when fail-closed and id cannot execute.
 */
export function executeProcessor(
  processorId: string,
  value: unknown,
  registry: StrategyRegistry,
  opts?: ExecuteOptions,
): unknown {
  const failClosed = opts?.failClosed !== false;
  const resolved = registry.resolve(processorId);

  if (!resolved) {
    if (failClosed) throw new ProcessorUnresolvedError(processorId);
    return value;
  }

  if (resolved.kind === 'builtin') {
    return executeBuiltin(resolved.op, value);
  }

  return executeImpl(resolved.impl, value, registry, opts);
}
