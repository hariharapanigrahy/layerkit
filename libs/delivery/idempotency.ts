/**
 * Idempotency store — in-memory default; optional file under projectDir.
 * Not multi-instance safe in v0.2.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface IdempotencyMeta {
  vendor: string;
  at: string;
  status: number;
}

export interface IdempotencyStore {
  seen(key: string): Promise<boolean>;
  record(key: string, meta: IdempotencyMeta): Promise<void>;
}

export class MemoryIdempotencyStore implements IdempotencyStore {
  private readonly map = new Map<string, IdempotencyMeta>();

  async seen(key: string): Promise<boolean> {
    return this.map.has(key);
  }

  async record(key: string, meta: IdempotencyMeta): Promise<void> {
    this.map.set(key, meta);
  }

  /** Test/helper: snapshot size */
  size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }
}

export class FileIdempotencyStore implements IdempotencyStore {
  private readonly filePath: string;
  private cache: Record<string, IdempotencyMeta> | null = null;

  constructor(projectDir: string, filename = 'idempotency.json') {
    const dir = join(projectDir, 'idempotency');
    mkdirSync(dir, { recursive: true });
    this.filePath = join(dir, filename);
  }

  private load(): Record<string, IdempotencyMeta> {
    if (this.cache) return this.cache;
    if (!existsSync(this.filePath)) {
      this.cache = {};
      return this.cache;
    }
    try {
      this.cache = JSON.parse(readFileSync(this.filePath, 'utf8')) as Record<string, IdempotencyMeta>;
    } catch {
      this.cache = {};
    }
    return this.cache;
  }

  private save(): void {
    writeFileSync(this.filePath, JSON.stringify(this.load(), null, 2), 'utf8');
  }

  async seen(key: string): Promise<boolean> {
    return key in this.load();
  }

  async record(key: string, meta: IdempotencyMeta): Promise<void> {
    const data = this.load();
    data[key] = meta;
    this.save();
  }
}

export function buildIdempotencyKey(
  vendor: string,
  eventId: string | undefined,
  operationId: string,
  keyFrom = 'eventId',
): string {
  const idPart = eventId && keyFrom === 'eventId' ? eventId : eventId ?? 'no-event-id';
  return `${vendor}::${operationId}::${idPart}`;
}
