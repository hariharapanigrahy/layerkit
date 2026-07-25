/**
 * Client data-layer ingress contract (DomainEvent).
 * Canonical home: domain package. Re-exported from map-engine for one minor version.
 */

export interface ConsentContext {
  purposes: string[];
  lawfulBasis?: string;
  gpc?: boolean;
  doNotSell?: boolean;
}

export interface DomainEvent {
  intent: string;
  eventId?: string;
  occurredAt?: string;
  user?: Record<string, unknown>;
  product?: Record<string, unknown>;
  /** Cart/checkout line items for foreach flows */
  products?: Record<string, unknown>[];
  value?: Record<string, unknown>;
  context?: Record<string, unknown>;
  consent?: ConsentContext;
  region?: string;
  tenantId?: string;
  [key: string]: unknown;
}
