/**
 * v0.2 observation sinks: noop, stdout_json, file.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { wireFingerprint } from './fingerprint.js';
import type { AuditEvent, AuditSinkV02, EmitFailurePolicy, ObservationConfig } from './types.js';
import { DEFAULT_OBSERVATION_CONFIG } from './types.js';

export interface EmitContext {
  projectDir: string;
  config?: ObservationConfig;
  /** Optional raw wire for fingerprint only (never logged raw) */
  wire?: unknown;
}

export interface ObservationBus {
  emitAudit(event: Omit<AuditEvent, 'id' | 'ts' | 'wireFingerprint'> & Partial<Pick<AuditEvent, 'id' | 'ts' | 'wireFingerprint'>>, wire?: unknown): void;
  config: ObservationConfig;
}

function resolvePath(template: string, projectDir: string): string {
  return template.replace(/\{projectDir\}/g, projectDir);
}

export function createObservationBus(ctx: EmitContext): ObservationBus {
  const config = ctx.config ?? {
    ...DEFAULT_OBSERVATION_CONFIG,
    audit: [{ type: 'file', path: join(ctx.projectDir, 'audit') }],
  };

  const policy: EmitFailurePolicy = config.emitFailurePolicy ?? 'best_effort';

  const emitAudit: ObservationBus['emitAudit'] = (partial, wire) => {
    const fp =
      partial.wireFingerprint ??
      (wire !== undefined || ctx.wire !== undefined
        ? wireFingerprint(wire ?? ctx.wire, config)
        : undefined);

    const event: AuditEvent = {
      id: partial.id ?? `aud_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      ts: partial.ts ?? new Date().toISOString(),
      tenantId: partial.tenantId,
      vendor: partial.vendor,
      intent: partial.intent,
      eventId: partial.eventId,
      stage: partial.stage,
      outcome: partial.outcome,
      reasonCode: partial.reasonCode,
      durationMs: partial.durationMs,
      wireFingerprint: fp,
      proposalId: partial.proposalId,
      mapVersion: partial.mapVersion,
      privacyPolicyVersion: partial.privacyPolicyVersion,
    };

    for (const sink of config.audit) {
      try {
        writeSink(sink, event, ctx.projectDir);
      } catch (err) {
        if (policy === 'fail_track') {
          throw err;
        }
        // best_effort: swallow
        console.error(
          JSON.stringify({
            type: 'observation_emit_failed',
            sink: sink.type,
            message: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    }
  };

  return { emitAudit, config };
}

function writeSink(sink: AuditSinkV02, event: AuditEvent, projectDir: string): void {
  if (sink.type === 'noop') return;
  if (sink.type === 'custom_java') return; // TS no-op

  const line = JSON.stringify(event) + '\n';

  if (sink.type === 'stdout_json') {
    process.stdout.write(line);
    return;
  }

  if (sink.type === 'file') {
    const dir = resolvePath(sink.path, projectDir);
    mkdirSync(dir, { recursive: true });
    const day = event.ts.slice(0, 10);
    const file = join(dir, `${day}.jsonl`);
    // ensure parent exists (join may be file path if user passed file)
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, line, 'utf8');
  }
}

export function noopSink(): AuditSinkV02 {
  return { type: 'noop' };
}

export function stdoutJsonSink(): AuditSinkV02 {
  return { type: 'stdout_json' };
}

export function fileSink(path: string): AuditSinkV02 {
  return { type: 'file', path };
}
