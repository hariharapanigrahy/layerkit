/**
 * v0.2 observation sinks: noop, stdout_json, file, spi, otel_otlp_http (safe placeholder).
 *
 * `otel_otlp_http` without fetchImpl never opens the network — events go to an in-memory
 * debug buffer and a one-time structured log. Real OTLP export is a customer SPI.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { wireFingerprint } from './fingerprint.js';
import { getSinkSpi } from './spi.js';
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

/** In-memory record for default (no-network) otel_otlp_http handling. */
export interface OtelOtlpHttpBufferEntry {
  endpoint: string;
  headers?: Record<string, string>;
  event: AuditEvent;
  at: string;
}

const otelOtlpHttpBuffer: OtelOtlpHttpBufferEntry[] = [];
const otelOtlpHttpLoggedOnce = new Set<string>();

export function getOtelOtlpHttpBuffer(): readonly OtelOtlpHttpBufferEntry[] {
  return otelOtlpHttpBuffer;
}

export function clearOtelOtlpHttpBuffer(): void {
  otelOtlpHttpBuffer.length = 0;
  otelOtlpHttpLoggedOnce.clear();
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
        writeSink(sink, event, ctx.projectDir, policy);
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

function writeSink(
  sink: AuditSinkV02,
  event: AuditEvent,
  projectDir: string,
  policy: EmitFailurePolicy,
): void {
  if (sink.type === 'noop') return;
  if (sink.type === 'custom_java') return; // TS no-op

  if (sink.type === 'spi') {
    writeSpiSink(sink.name, event, policy);
    return;
  }

  if (sink.type === 'otel_otlp_http') {
    writeOtelOtlpHttpSink(sink, event);
    return;
  }

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

function writeSpiSink(name: string, event: AuditEvent, policy: EmitFailurePolicy): void {
  const spi = getSinkSpi(name);
  if (!spi) {
    throw new Error(`observation SPI sink not registered: ${name}`);
  }
  const result = spi.emitAudit(event);
  if (result != null && typeof (result as Promise<void>).then === 'function') {
    void (result as Promise<void>).catch((err) => {
      console.error(
        JSON.stringify({
          type: 'observation_emit_failed',
          sink: 'spi',
          name,
          policy,
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    });
  }
}

/**
 * Default path: buffer + one-time structured note (no network).
 * If `fetchImpl` is provided, fire-and-forget a minimal JSON POST (still best_effort).
 * Real production OTLP is expected via customer SPI — Layerkit does not ship an OTel SDK.
 */
function writeOtelOtlpHttpSink(
  sink: Extract<AuditSinkV02, { type: 'otel_otlp_http' }>,
  event: AuditEvent,
): void {
  const at = new Date().toISOString();
  otelOtlpHttpBuffer.push({
    endpoint: sink.endpoint,
    headers: sink.headers,
    event,
    at,
  });

  if (!otelOtlpHttpLoggedOnce.has(sink.endpoint)) {
    otelOtlpHttpLoggedOnce.add(sink.endpoint);
    console.error(
      JSON.stringify({
        type: 'observation_otel_otlp_http_deferred',
        message:
          'otel_otlp_http is a safe no-network placeholder; real OTLP export is customer SPI (no OTel SDK dependency)',
        endpoint: sink.endpoint,
        buffered: true,
      }),
    );
  }

  if (typeof sink.fetchImpl === 'function') {
    // Optional injectable only — default CI/runtime never hits the network.
    void sink
      .fetchImpl(sink.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(sink.headers ?? {}),
        },
        body: JSON.stringify({ resourceSpans: [], auditEvent: event }),
      })
      .catch((err: unknown) => {
        console.error(
          JSON.stringify({
            type: 'observation_emit_failed',
            sink: 'otel_otlp_http',
            endpoint: sink.endpoint,
            message: err instanceof Error ? err.message : String(err),
          }),
        );
      });
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

export function spiSink(name: string, options?: Record<string, unknown>): AuditSinkV02 {
  return options === undefined ? { type: 'spi', name } : { type: 'spi', name, options };
}

export function otelOtlpHttpSink(
  endpoint: string,
  headers?: Record<string, string>,
): AuditSinkV02 {
  return headers === undefined
    ? { type: 'otel_otlp_http', endpoint }
    : { type: 'otel_otlp_http', endpoint, headers };
}
