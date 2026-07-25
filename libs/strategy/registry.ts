/**
 * Strategy registry: resolve builtin.* and project agent processor JSON.
 *
 * Resolution order:
 * 1. Builtin allowlist by exact processorId `builtin.${op}`
 * 2. Inline / project processors by id
 * 3. Else unresolved (fail closed)
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BUILTIN_OPS,
  builtinProcessorId,
  isBuiltinOp,
  type BuiltinOp,
  type ExecutableProcessor,
  type ProcessorImpl,
} from './types.js';

export type ResolvedProcessor =
  | { kind: 'builtin'; op: BuiltinOp; processorId: string }
  | { kind: 'agent'; processorId: string; spec: ExecutableProcessor; impl: ProcessorImpl };

export class StrategyRegistry {
  private readonly byId = new Map<string, ExecutableProcessor>();

  /** Register (or replace) an executable processor document. */
  register(spec: ExecutableProcessor): void {
    if (!spec?.id) throw new Error('processor missing id');
    this.byId.set(spec.id, spec);
  }

  /** Register many. */
  registerAll(specs: Iterable<ExecutableProcessor>): void {
    for (const s of specs) this.register(s);
  }

  /**
   * Load all `*.json` processor files from a directory (e.g. `.layerkit/processors`).
   * Indexes by document `id` field when present; falls back to filename → dots.
   */
  loadFromDir(dir: string): number {
    if (!existsSync(dir)) return 0;
    let n = 0;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const raw = readFileSync(join(dir, f), 'utf8');
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
      if (!parsed || typeof parsed !== 'object') continue;
      const obj = parsed as Record<string, unknown>;
      const id =
        typeof obj.id === 'string' && obj.id.length > 0
          ? obj.id
          : f.replace(/\.json$/, '').replace(/_/g, '.');
      this.register({ ...(obj as unknown as ExecutableProcessor), id });
      n++;
    }
    return n;
  }

  get(id: string): ExecutableProcessor | undefined {
    return this.byId.get(id);
  }

  listIds(): string[] {
    return [...this.byId.keys()].sort();
  }

  /**
   * Resolve a processorId to an executable form.
   * Returns null if unresolved (caller fail-closes).
   */
  resolve(processorId: string): ResolvedProcessor | null {
    if (!processorId) return null;

    // 1. Builtin allowlist
    if (processorId.startsWith('builtin.')) {
      const op = processorId.slice('builtin.'.length);
      if (isBuiltinOp(op)) {
        return { kind: 'builtin', op, processorId };
      }
      return null; // unknown builtin.* is fail-closed
    }

    // 2. Project / inline agent processor
    const spec = this.byId.get(processorId);
    if (!spec) return null;
    if (!spec.implementation) return null;
    return {
      kind: 'agent',
      processorId,
      spec,
      impl: spec.implementation,
    };
  }

  /** True if processorId is on the closed builtin allowlist. */
  isKnownBuiltin(processorId: string): boolean {
    if (!processorId.startsWith('builtin.')) return false;
    return isBuiltinOp(processorId.slice('builtin.'.length));
  }

  /** All builtin processorIds. */
  static builtinIds(): string[] {
    return BUILTIN_OPS.map((op) => builtinProcessorId(op));
  }
}

/** Create a registry optionally seeded from a processors directory and/or inline map. */
export function createStrategyRegistry(opts?: {
  processorsDir?: string;
  processors?: Record<string, ExecutableProcessor> | ExecutableProcessor[];
}): StrategyRegistry {
  const reg = new StrategyRegistry();
  if (opts?.processorsDir) reg.loadFromDir(opts.processorsDir);
  if (opts?.processors) {
    if (Array.isArray(opts.processors)) {
      reg.registerAll(opts.processors);
    } else {
      for (const [id, spec] of Object.entries(opts.processors)) {
        reg.register({ ...spec, id: spec.id ?? id });
      }
    }
  }
  return reg;
}
