/**
 * Gate: SPI audit sink receives events; file sink still works;
 * otel_otlp_http does not throw and never requires network.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertEqual, assertTrue } from '../../harness/assert.js';
import {
  clearOtelOtlpHttpBuffer,
  clearSinkSpi,
  createObservationBus,
  getOtelOtlpHttpBuffer,
  listSinkSpi,
  registerSinkSpi,
  type AuditEvent,
  type ObservationConfig,
} from '../../../libs/observation/index.js';

const root = mkdtempSync(join(tmpdir(), 'layerkit-obs-otel-spi-'));
const projectDir = join(root, '.layerkit');
const auditDir = join(projectDir, 'audit');

try {
  clearSinkSpi();
  clearOtelOtlpHttpBuffer();

  const received: AuditEvent[] = [];
  registerSinkSpi({
    name: 'test',
    emitAudit(event) {
      received.push(event);
    },
  });

  assertTrue('SPI registered', listSinkSpi().includes('test'));

  const config: ObservationConfig = {
    schemaVersion: 2,
    tracing: [{ type: 'noop' }],
    metrics: [{ type: 'noop' }],
    logs: [{ type: 'noop' }],
    audit: [
      { type: 'spi', name: 'test' },
      { type: 'file', path: auditDir },
      { type: 'otel_otlp_http', endpoint: 'https://otel.example.invalid/v1/traces' },
    ],
    events: {
      mapApply: true,
      privacyDecision: true,
      deliveryAttempt: true,
      deliverySuccess: true,
      deliveryFailure: true,
      skip: true,
    },
    telemetryPii: 'never',
    emitFailurePolicy: 'best_effort',
  };

  const bus = createObservationBus({ projectDir, config });

  bus.emitAudit({
    id: 'aud_gate_1',
    ts: '2026-07-26T12:00:00.000Z',
    vendor: 'meta',
    intent: 'purchase',
    stage: 'deliver',
    outcome: 'success',
    eventId: 'evt-1',
  });

  assertEqual('SPI received one event', received.length, 1);
  assertEqual('SPI event id', received[0]!.id, 'aud_gate_1');
  assertEqual('SPI event vendor', received[0]!.vendor, 'meta');
  assertEqual('SPI event stage', received[0]!.stage, 'deliver');

  assertTrue('audit dir exists', existsSync(auditDir));
  const dayFiles = readdirSync(auditDir).filter((f) => f.endsWith('.jsonl'));
  assertTrue('file sink wrote jsonl', dayFiles.length >= 1, dayFiles.join(','));
  const fileBody = readFileSync(join(auditDir, dayFiles[0]!), 'utf8');
  assertTrue('file contains event id', fileBody.includes('aud_gate_1'), fileBody);
  assertTrue('file contains vendor', fileBody.includes('meta'), fileBody);

  const buffer = getOtelOtlpHttpBuffer();
  assertTrue('otel buffer has entry (no network)', buffer.length >= 1);
  assertEqual(
    'otel buffer endpoint',
    buffer[0]!.endpoint,
    'https://otel.example.invalid/v1/traces',
  );
  assertEqual('otel buffer event id', buffer[0]!.event.id, 'aud_gate_1');

  // Second emit with only otel sink — still no throw
  const otelOnly = createObservationBus({
    projectDir,
    config: {
      ...config,
      audit: [{ type: 'otel_otlp_http', endpoint: 'https://otel.example.invalid/v1/logs' }],
    },
  });
  otelOnly.emitAudit({
    vendor: 'meta',
    intent: 'purchase',
    stage: 'map',
    outcome: 'success',
  });
  assertTrue('otel second emit buffered', getOtelOtlpHttpBuffer().length >= 2);

  console.log('observation-otel-spi: all checks passed');
} finally {
  clearSinkSpi();
  clearOtelOtlpHttpBuffer();
  rmSync(root, { recursive: true, force: true });
}
