/**
 * Strategy / processor types (execute plane).
 * Domain ProcessorSpec remains metadata; executable shape lives here.
 */

import type { DocSource } from '../domain/types.js';

/**
 * Builtin op ids (closed allowlist). Registry processorId for a builtin is always
 * `builtin.${op}` — e.g. op `hash.sha256_hex` ↔ processorId `builtin.hash.sha256_hex`.
 */
export type BuiltinOp =
  | 'identity'
  | 'trim'
  | 'lowercase'
  | 'string.trim_lower'
  | 'email.normalize_basic'
  | 'phone.digits_only'
  | 'hash.sha256_hex'
  | 'timestamp.unix_seconds'
  | 'timestamp.unix_millis'
  | 'currency.iso4217_upper';

export const BUILTIN_OPS: readonly BuiltinOp[] = [
  'identity',
  'trim',
  'lowercase',
  'string.trim_lower',
  'email.normalize_basic',
  'phone.digits_only',
  'hash.sha256_hex',
  'timestamp.unix_seconds',
  'timestamp.unix_millis',
  'currency.iso4217_upper',
] as const;

export function builtinProcessorId(op: BuiltinOp): string {
  return `builtin.${op}`;
}

export function isBuiltinOp(op: string): op is BuiltinOp {
  return (BUILTIN_OPS as readonly string[]).includes(op);
}

/** v0.2: no CEL/jsonata expression type */
export type ProcessorImpl =
  | { type: 'builtin'; op: BuiltinOp; params?: Record<string, unknown> }
  | { type: 'pipeline'; steps: ProcessorImpl[] }
  | { type: 'java_ref'; className: string; method: string }
  | { type: 'ts_module'; exportName: string };

/** Executable processor document (agent JSON under .layerkit/processors/). */
export interface ExecutableProcessor {
  id: string;
  kind: 'builtin' | 'agent' | 'custom';
  description: string;
  sources?: DocSource[];
  category?: string;
  inputTypes?: string[];
  outputType?: string;
  implementation?: ProcessorImpl;
  status?: 'draft' | 'reviewed' | 'stable';
  version?: string;
  piiAffecting?: boolean;
  /** Domain metadata field; ignored at execute time */
  implementationHint?: string;
}

export class ProcessorUnresolvedError extends Error {
  readonly code = 'processor_unresolved' as const;
  constructor(
    readonly processorId: string,
    message?: string,
  ) {
    super(message ?? `processor_unresolved: ${processorId}`);
    this.name = 'ProcessorUnresolvedError';
  }
}
