import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { HEARTBEAT_STATUS, type HeartbeatStatus, type MonitorStatus } from '@pingwatch/shared';
import type { PingWatchPrismaClient } from '@pingwatch/db';
import { PRISMA_CLIENT } from '../common/di-tokens';
import { HeartbeatWriterService } from './heartbeat-writer.service';
import { SchedulerService } from './scheduler.service';
import type { MonitorSpec } from './scheduler.types';
import { DAY_MS } from './time-buckets';

interface MonitorRow {
  id: string;
  type: string;
  config: string;
  intervalSeconds: number;
  retries: number;
  retryIntervalSeconds: number;
  timeoutMs: number;
  status: string;
  isActive: boolean;
}

/**
 * Owns the lifecycle of running monitors (PLAN §3.0). On boot — and on every (re)start — it
 * REHYDRATES each monitor from the DB: restores the last CONFIRMED status (never `pending`, so a
 * monitor that was mid-confirmation at crash can't spuriously re-alert) and backfills the 24h ring
 * from recent heartbeats so uptime is correct immediately. Then registers it with the scheduler.
 */
@Injectable()
export class MonitorEngineService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MonitorEngineService.name);

  constructor(
    @Inject(PRISMA_CLIENT) private readonly db: PingWatchPrismaClient,
    private readonly scheduler: SchedulerService,
    private readonly writer: HeartbeatWriterService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const monitors = await this.db.monitor.findMany({ where: { isActive: true } });
    for (const monitor of monitors) await this.launch(monitor);
    if (monitors.length > 0) this.logger.log(`Engine started ${monitors.length} monitor(s)`);
  }

  async start(monitorId: string): Promise<void> {
    const monitor = await this.db.monitor.findUnique({ where: { id: monitorId } });
    if (monitor?.isActive) await this.launch(monitor);
  }

  async restart(monitorId: string): Promise<void> {
    this.scheduler.stopMonitor(monitorId);
    await this.start(monitorId);
  }

  stop(monitorId: string): void {
    this.scheduler.stopMonitor(monitorId);
  }

  private async launch(monitor: MonitorRow): Promise<void> {
    // Agent-sourced system monitors are push-based (P3.3) — the engine doesn't schedule a check.
    if (monitor.type === 'system') {
      try {
        if ((JSON.parse(monitor.config) as { source?: string }).source === 'agent') return;
      } catch {
        // fall through and schedule
      }
    }
    const initialStatus = await this.rehydrateStatus(monitor.id, monitor.status);
    await this.rehydrateRing(monitor.id);
    this.scheduler.startMonitor(this.toSpec(monitor, initialStatus));
  }

  /** The last UP/DOWN heartbeat is the confirmed status; PENDING beats are ignored. */
  private async rehydrateStatus(monitorId: string, stored: string): Promise<MonitorStatus> {
    const last = await this.db.heartbeat.findFirst({
      where: { monitorId, status: { in: [HEARTBEAT_STATUS.UP, HEARTBEAT_STATUS.DOWN] } },
      orderBy: { createdAt: 'desc' },
      select: { status: true },
    });
    if (last) return last.status === HEARTBEAT_STATUS.UP ? 'up' : 'down';
    return stored === 'up' || stored === 'down' ? stored : 'pending';
  }

  private async rehydrateRing(monitorId: string): Promise<void> {
    const beats = await this.db.heartbeat.findMany({
      where: { monitorId, createdAt: { gte: new Date(Date.now() - DAY_MS) } },
      orderBy: { createdAt: 'asc' },
      select: { status: true, coverageMs: true, createdAt: true },
    });
    this.writer.ring(monitorId).seed(
      beats.map((b) => ({
        at: b.createdAt.getTime(),
        beatStatus: b.status as HeartbeatStatus,
        coverageMs: b.coverageMs,
      })),
    );
  }

  private toSpec(monitor: MonitorRow, initialStatus: MonitorStatus): MonitorSpec {
    let config: unknown = {};
    try {
      config = JSON.parse(monitor.config);
    } catch {
      config = {};
    }
    return {
      id: monitor.id,
      type: monitor.type,
      config,
      intervalMs: monitor.intervalSeconds * 1000,
      retries: monitor.retries,
      retryIntervalMs: monitor.retryIntervalSeconds * 1000,
      timeoutMs: monitor.timeoutMs,
      initialStatus,
    };
  }
}
