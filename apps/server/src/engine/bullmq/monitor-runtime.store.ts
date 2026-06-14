import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { MonitorStatus } from '@pingwatch/shared';
import { LOCK_TTL_MS, REDIS_CONNECTION, lockKey, runtimeKey } from './bullmq.constants';

export interface RuntimeState {
  status: MonitorStatus;
  failCount: number;
}

// Release the lock only if we still own it (compare nonce, then delete) — avoids deleting a lock a
// slower holder re-acquired after our TTL elapsed.
const RELEASE_LUA = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Centralized anti-flap state for the BullMQ scheduler (P4.2). The per-instance in-memory
 * `MonitorRuntime` cannot work across N instances — two workers checking the same monitor would each
 * keep their own failCount and never confirm consistently. This stores {status, failCount} in Redis
 * and serializes every read-modify-write under a per-monitor lock, so the state machine advances
 * exactly once per check cluster-wide. The pure `MonitorRuntime` logic is reused (not duplicated).
 */
@Injectable()
export class MonitorRuntimeStore {
  constructor(@Inject(REDIS_CONNECTION) private readonly redis: Redis) {}

  async getState(monitorId: string): Promise<RuntimeState | null> {
    const h = await this.redis.hgetall(runtimeKey(monitorId));
    if (!h.status) return null;
    return { status: h.status as MonitorStatus, failCount: Number(h.failCount ?? 0) };
  }

  /** Seed initial state only if absent (idempotent across instances racing boot rehydration). */
  async seedIfAbsent(monitorId: string, status: MonitorStatus): Promise<void> {
    const created = await this.redis.hsetnx(runtimeKey(monitorId), 'status', status);
    if (created === 1) await this.redis.hset(runtimeKey(monitorId), 'failCount', '0');
  }

  async setState(monitorId: string, state: RuntimeState): Promise<void> {
    await this.redis.hset(runtimeKey(monitorId), { status: state.status, failCount: String(state.failCount) });
  }

  async clear(monitorId: string): Promise<void> {
    await this.redis.del(runtimeKey(monitorId));
  }

  /** Run `fn` under the monitor's lock. Returns null if the lock couldn't be taken (~5s) → skip beat. */
  async withLock<T>(monitorId: string, fn: () => Promise<T>): Promise<T | null> {
    const key = lockKey(monitorId);
    const nonce = randomBytes(16).toString('hex');
    let acquired = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const res = await this.redis.set(key, nonce, 'PX', LOCK_TTL_MS, 'NX');
      if (res === 'OK') {
        acquired = true;
        break;
      }
      await sleep(100);
    }
    if (!acquired) return null;
    try {
      return await fn();
    } finally {
      await this.redis.eval(RELEASE_LUA, 1, key, nonce);
    }
  }
}
