/**
 * Observation sink SPI — customer stacks register named sinks without
 * Layerkit taking an OpenTelemetry SDK dependency.
 *
 * Prefer SPI for real OTLP / Datadog / SIEM export; the built-in
 * `otel_otlp_http` sink type is a safe no-network placeholder.
 */
import type { AuditEvent } from './types.js';

export interface ObservationSinkSpi {
  name: string;
  emitAudit(event: AuditEvent): void | Promise<void>;
}

const registry = new Map<string, ObservationSinkSpi>();

export function registerSinkSpi(spi: ObservationSinkSpi): void {
  if (!spi.name || typeof spi.name !== 'string') {
    throw new Error('ObservationSinkSpi.name must be a non-empty string');
  }
  registry.set(spi.name, spi);
}

export function getSinkSpi(name: string): ObservationSinkSpi | undefined {
  return registry.get(name);
}

export function listSinkSpi(): string[] {
  return [...registry.keys()].sort();
}

/** Test helper — clear all registered SPIs. */
export function clearSinkSpi(): void {
  registry.clear();
}
