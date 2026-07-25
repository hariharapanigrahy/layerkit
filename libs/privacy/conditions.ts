/**
 * Structured ConditionExpr evaluation (v0.2 — no CEL).
 */
import type { ConditionExpr } from './types.js';

export function getPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  let cur: unknown = obj;
  for (const p of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/**
 * Evaluate a structured condition against a root object (event or working memory).
 */
export function evalCondition(expr: ConditionExpr, root: unknown): boolean {
  switch (expr.op) {
    case 'and':
      return expr.args.every((a) => evalCondition(a, root));
    case 'or':
      return expr.args.some((a) => evalCondition(a, root));
    case 'not':
      return !evalCondition(expr.arg, root);
    case 'exists': {
      const v = getPath(root, expr.path);
      return v !== undefined && v !== null;
    }
    case 'eq':
      return getPath(root, expr.path) === expr.value;
    case 'neq':
      return getPath(root, expr.path) !== expr.value;
    case 'gt':
      return compare(getPath(root, expr.path), expr.value) > 0;
    case 'gte':
      return compare(getPath(root, expr.path), expr.value) >= 0;
    case 'lt':
      return compare(getPath(root, expr.path), expr.value) < 0;
    case 'lte':
      return compare(getPath(root, expr.path), expr.value) <= 0;
    case 'in': {
      const v = getPath(root, expr.path);
      const list = expr.value;
      if (!Array.isArray(list)) return false;
      return list.includes(v);
    }
    default: {
      // Exhaustiveness guard for future ops
      const _never: never = expr;
      void _never;
      return false;
    }
  }
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  return 0;
}
