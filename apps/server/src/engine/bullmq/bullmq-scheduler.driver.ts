import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { SchedulerDriver } from '../scheduler.driver';
import type { MonitorSpec } from '../scheduler.types';
import { CHECK_JOB, CHECK_QUEUE, REDIS_CONNECTION, jobSchedulerId, runtimeKey, specKey } from './bullmq.constants';
import { MonitorRuntimeStore } from './monitor-runtime.store';

/**
 * Distributed scheduler driver (P4.2). Registers ONE BullMQ repeatable job-scheduler per monitor,
 * so the queue guarantees a single due check per interval cluster-wide (no double-scheduling no
 * matter how many instances run). The monitor's spec is written to Redis and re-read by the worker,
 * so a config/interval edit applies on the next tick without a stale-job generation token. NOTE: the
 * cadence is the fixed `intervalMs` (no in-process-style shortening to retryIntervalMs while pending)
 * — anti-flap still confirms after `retries+1` failures, just at the steady interval.
 */
@Injectable()
export class BullMqSchedulerDriver implements SchedulerDriver, OnModuleDestroy {
  private readonly queue: Queue;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly redis: Redis,
    private readonly store: MonitorRuntimeStore,
  ) {
    this.queue = new Queue(CHECK_QUEUE, { connection: redis });
  }

  async startMonitor(spec: MonitorSpec): Promise<void> {
    await this.redis.set(specKey(spec.id), JSON.stringify(spec));
    // Seed the centralized anti-flap state from the rehydrated status (idempotent across instances).
    await this.store.seedIfAbsent(spec.id, spec.initialStatus);
    await this.queue.upsertJobScheduler(
      jobSchedulerId(spec.id),
      { every: spec.intervalMs },
      { name: CHECK_JOB, data: { monitorId: spec.id } },
    );
  }

  async restartMonitor(spec: MonitorSpec): Promise<void> {
    await this.startMonitor(spec); // re-write spec + re-upsert scheduler (interval may have changed)
  }

  async stopMonitor(id: string): Promise<void> {
    await this.queue.removeJobScheduler(jobSchedulerId(id));
    await this.redis.del(specKey(id), runtimeKey(id));
  }

  async activeCount(): Promise<number> {
    return this.queue.getJobSchedulersCount();
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
