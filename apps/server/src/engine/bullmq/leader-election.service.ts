import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { LEADER_KEY, LEADER_RENEW_MS, LEADER_TTL_MS, REDIS_CONNECTION } from './bullmq.constants';

/**
 * Single-leader election over Redis (P4.2). Cluster-singleton crons (rollup, repeat-notify,
 * escalation) gate on {@link isLeader} so they fire exactly once cluster-wide. Only registered in
 * bullmq mode; in-process mode has no leader and those crons run unconditionally (single instance).
 */
@Injectable()
export class LeaderElectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LeaderElectionService.name);
  private readonly instanceId = randomBytes(8).toString('hex');
  private leader = false;
  private timer?: NodeJS.Timeout;

  constructor(@Inject(REDIS_CONNECTION) private readonly redis: Redis) {}

  onModuleInit(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), LEADER_RENEW_MS);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    // Relinquish leadership promptly so a survivor takes over without waiting out the TTL.
    if (this.leader) {
      try {
        const owner = await this.redis.get(LEADER_KEY);
        if (owner === this.instanceId) await this.redis.del(LEADER_KEY);
      } catch {
        // best-effort
      }
    }
  }

  isLeader(): boolean {
    return this.leader;
  }

  private async tick(): Promise<void> {
    try {
      const acquired = await this.redis.set(LEADER_KEY, this.instanceId, 'PX', LEADER_TTL_MS, 'NX');
      if (acquired === 'OK') {
        if (!this.leader) this.logger.log('became scheduler leader');
        this.leader = true;
        return;
      }
      const owner = await this.redis.get(LEADER_KEY);
      if (owner === this.instanceId) {
        await this.redis.pexpire(LEADER_KEY, LEADER_TTL_MS);
        this.leader = true;
      } else {
        this.leader = false;
      }
    } catch {
      this.leader = false;
    }
  }
}
