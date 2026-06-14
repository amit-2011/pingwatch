import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { type Job, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { PINGWATCH_CONFIG } from '../../common/di-tokens';
import type { ResolvedConfig } from '../../config/schema';
import { CheckRunnerService } from '../check-runner.service';
import { MonitorRuntime } from '../monitor-runtime';
import {
  MONITOR_BEAT_EVENT,
  MONITOR_TRANSITION_EVENT,
  type MonitorBeatEvent,
  type MonitorSpec,
  type MonitorTransitionEvent,
} from '../scheduler.types';
import { CHECK_QUEUE, REDIS_CONNECTION, specKey } from './bullmq.constants';
import { MonitorRuntimeStore } from './monitor-runtime.store';

/**
 * BullMQ worker pool (P4.2). Every instance runs one — together they drain the check queue. For each
 * job: re-read the monitor's spec from Redis (drop if the monitor was stopped), run the stateless
 * CheckRunner, then advance the CENTRALIZED anti-flap state under a per-monitor lock (reusing the
 * pure MonitorRuntime), and emit the SAME beat/transition events locally so HeartbeatWriter /
 * RealtimeService / IncidentListener fire on whichever instance ran the check.
 */
@Injectable()
export class CheckWorkerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(CheckWorkerService.name);
  private worker?: Worker;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly redis: Redis,
    @Inject(PINGWATCH_CONFIG) private readonly config: ResolvedConfig,
    private readonly runner: CheckRunnerService,
    private readonly store: MonitorRuntimeStore,
    private readonly events: EventEmitter2,
  ) {}

  onApplicationBootstrap(): void {
    this.worker = new Worker(CHECK_QUEUE, (job) => this.process(job), {
      connection: this.redis.duplicate(),
      concurrency: this.config.maxConcurrency,
    });
    this.worker.on('error', (err) => this.logger.error(`worker error: ${err.message}`));
    this.logger.log(`BullMQ check worker started (concurrency ${this.config.maxConcurrency})`);
  }

  private async process(job: Job<{ monitorId: string }>): Promise<void> {
    const { monitorId } = job.data;
    const raw = await this.redis.get(specKey(monitorId));
    if (!raw) return; // monitor stopped/removed since the job was scheduled — drop
    const spec = JSON.parse(raw) as MonitorSpec;

    const result = await this.runner.run(spec.type, spec.config, spec.timeoutMs);

    const decision = await this.store.withLock(monitorId, async () => {
      // The check can run up to timeoutMs; if the monitor was stopped/removed in that window the spec
      // is gone — produce no beat and don't re-create runtime state for a paused monitor (review fix).
      if ((await this.redis.exists(specKey(monitorId))) === 0) return null;
      const state = (await this.store.getState(monitorId)) ?? { status: spec.initialStatus, failCount: 0 };
      const runtime = new MonitorRuntime(state.status, state.failCount);
      const d = runtime.applyResult(result.status === 'up', spec.retries);
      await this.store.setState(monitorId, runtime.getState());
      return d;
    });
    if (!decision) return; // lock contention, or the monitor was stopped during the check

    const at = Date.now();
    const beat: MonitorBeatEvent = {
      monitorId,
      result,
      status: decision.status,
      beatStatus: decision.beatStatus,
      important: decision.important,
      changed: decision.changed,
      failCount: decision.failCount,
      coverageMs: spec.intervalMs,
      at,
    };
    this.events.emit(MONITOR_BEAT_EVENT, beat);

    if (decision.important) {
      const transition: MonitorTransitionEvent = {
        monitorId,
        to: decision.status === 'up' ? 'up' : 'down',
        result,
        at,
      };
      this.events.emit(MONITOR_TRANSITION_EVENT, transition);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
