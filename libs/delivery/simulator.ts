/**
 * Delivery simulator — dry_run / shadow never open network.
 * live mode requires explicit allowNetwork (not default in v0.2 TS path).
 */
import { buildIdempotencyKey, type IdempotencyStore, MemoryIdempotencyStore } from './idempotency.js';
import { makeDlqRecord, writeDlqRecord } from './dlq.js';
import type {
  DeliveryMode,
  DeliveryPolicy,
  DeliveryRequest,
  DeliveryResult,
} from './types.js';
import { DEFAULT_DELIVERY_POLICY } from './types.js';

export interface SimulatorOptions {
  projectDir: string;
  policy?: Partial<DeliveryPolicy>;
  idempotency?: IdempotencyStore;
  /**
   * Live HTTP is blocked unless true. dry_run and shadow ignore this and never send.
   */
  allowNetwork?: boolean;
  /**
   * Optional spy for tests — incremented only when a real network send would occur.
   * dry_run/shadow always leave this at 0.
   */
  networkProbe?: { calls: number };
}

export class DeliverySimulator {
  readonly policy: DeliveryPolicy;
  readonly idempotency: IdempotencyStore;
  readonly networkProbe: { calls: number };
  private readonly projectDir: string;
  private readonly allowNetwork: boolean;

  constructor(opts: SimulatorOptions) {
    this.projectDir = opts.projectDir;
    this.policy = {
      ...DEFAULT_DELIVERY_POLICY,
      ...opts.policy,
      idempotency: {
        ...DEFAULT_DELIVERY_POLICY.idempotency,
        ...opts.policy?.idempotency,
      },
      retry: {
        ...DEFAULT_DELIVERY_POLICY.retry,
        ...opts.policy?.retry,
      },
      dlq: {
        ...DEFAULT_DELIVERY_POLICY.dlq,
        ...opts.policy?.dlq,
        sink: opts.policy?.dlq?.sink ?? DEFAULT_DELIVERY_POLICY.dlq.sink,
      },
    };
    this.idempotency = opts.idempotency ?? new MemoryIdempotencyStore();
    this.allowNetwork = opts.allowNetwork === true;
    this.networkProbe = opts.networkProbe ?? { calls: 0 };
  }

  /**
   * Deliver (or simulate) a request according to policy.mode.
   * dry_run / shadow: map+privacy assumed done by caller; no TCP/HTTP.
   */
  async deliver(req: DeliveryRequest, modeOverride?: DeliveryMode): Promise<DeliveryResult> {
    const mode = modeOverride ?? this.policy.mode;
    const key = buildIdempotencyKey(
      req.vendor,
      req.eventId,
      req.operationId,
      this.policy.idempotency.keyFrom,
    );

    if (await this.idempotency.seen(key)) {
      return {
        outcome: mode === 'shadow' ? 'shadow' : mode === 'dry_run' ? 'dry_run' : 'success',
        simulated: mode !== 'live',
        networkCalls: 0,
        httpStatus: 200,
        idempotentReplay: true,
        attempts: 0,
        reasonCode: 'idempotent_replay',
      };
    }

    if (mode === 'dry_run' || mode === 'shadow') {
      // Simulated success — zero network
      await this.idempotency.record(key, {
        vendor: req.vendor,
        at: new Date().toISOString(),
        status: 200,
      });
      return {
        outcome: mode === 'shadow' ? 'shadow' : 'dry_run',
        simulated: true,
        networkCalls: 0,
        httpStatus: 200,
        attempts: 1,
        reasonCode: mode === 'shadow' ? 'shadow_simulated_success' : 'dry_run_simulated_success',
      };
    }

    // live mode
    if (!this.allowNetwork) {
      const dlq = makeDlqRecord({
        vendor: req.vendor,
        operationId: req.operationId,
        eventId: req.eventId,
        intent: req.intent,
        errorClass: 'network',
        attempts: 0,
        event: req.event ?? null,
        wire: req.wire,
        requestHeadersRedacted: redactHeaders(req.headers ?? {}),
        mapVersion: req.mapVersion,
        privacyPolicyVersion: req.privacyPolicyVersion,
      });
      writeDlqRecord(this.projectDir, dlq, this.policy);
      return {
        outcome: 'failure',
        simulated: false,
        networkCalls: 0,
        errorClass: 'network',
        attempts: 0,
        dlqId: dlq.id,
        reasonCode: 'live_network_not_allowed',
      };
    }

    // Explicit allowNetwork path — still no real fetch in this module for safety in CI.
    // Count as a network intent for probe; actual HTTP belongs in a separate live client.
    this.networkProbe.calls += 1;
    await this.idempotency.record(key, {
      vendor: req.vendor,
      at: new Date().toISOString(),
      status: 200,
    });
    return {
      outcome: 'success',
      simulated: false,
      networkCalls: 1,
      httpStatus: 200,
      attempts: 1,
      reasonCode: 'live_send_recorded',
    };
  }

  /** Convenience: force shadow mode */
  async shadow(req: DeliveryRequest): Promise<DeliveryResult> {
    return this.deliver(req, 'shadow');
  }

  async dryRun(req: DeliveryRequest): Promise<DeliveryResult> {
    return this.deliver(req, 'dry_run');
  }
}

export function createDeliverySimulator(opts: SimulatorOptions): DeliverySimulator {
  return new DeliverySimulator(opts);
}

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    const lk = k.toLowerCase();
    if (lk === 'authorization' || lk.includes('api-key') || lk.includes('secret') || lk.includes('token')) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = v;
    }
  }
  return out;
}
