/**
 * Dead-letter queue — file directory sink (default `{projectDir}/dlq`).
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DeliveryPolicy, DlqRecord } from './types.js';

function resolvePath(template: string, projectDir: string): string {
  return template.replace(/\{projectDir\}/g, projectDir);
}

export function writeDlqRecord(
  projectDir: string,
  record: DlqRecord,
  policy: DeliveryPolicy,
): string {
  if (!policy.dlq.enabled) {
    return '';
  }

  const sink = policy.dlq.sink;
  if (sink.type === 'stdout_json') {
    process.stdout.write(JSON.stringify(record) + '\n');
    return `stdout:${record.id}`;
  }

  const dir = resolvePath(sink.path, projectDir);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${record.id}.json`);
  writeFileSync(file, JSON.stringify(record, null, 2), 'utf8');

  // Also append index line for ops
  appendFileSync(join(dir, 'index.jsonl'), JSON.stringify({ id: record.id, ts: record.ts, vendor: record.vendor }) + '\n');
  return file;
}

export function makeDlqRecord(
  partial: Omit<DlqRecord, 'schemaVersion' | 'id' | 'ts'> & { id?: string; ts?: string },
): DlqRecord {
  return {
    schemaVersion: 2,
    id: partial.id ?? `dlq_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    ts: partial.ts ?? new Date().toISOString(),
    vendor: partial.vendor,
    operationId: partial.operationId,
    eventId: partial.eventId,
    intent: partial.intent,
    errorClass: partial.errorClass,
    httpStatus: partial.httpStatus,
    attempts: partial.attempts,
    event: partial.event,
    wire: partial.wire,
    requestHeadersRedacted: partial.requestHeadersRedacted,
    mapVersion: partial.mapVersion,
    privacyPolicyVersion: partial.privacyPolicyVersion,
  };
}
