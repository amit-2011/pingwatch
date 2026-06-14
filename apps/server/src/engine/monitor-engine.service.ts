import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { MonitorStatus } from '@pingwatch/shared';
import type { PingWatchPrismaClient } from '@pingwatch/db';
import { PRISMA_CLIENT } from '../common/di-tokens';
import { SchedulerService } from './scheduler.service';
import type { MonitorSpec } from './scheduler.types';

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
 * Owns the lifecycle of running monitors: loads active monitors on boot and registers them with
 * the scheduler; exposes start/stop/restart for CRUD (T16). Builds a MonitorSpec from a row,
 * parsing the stored `config` JSON string.
 */
@Injectable()
export class MonitorEngineService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MonitorEngineService.name);

  constructor(
    @Inject(PRISMA_CLIENT) private readonly db: PingWatchPrismaClient,
    private readonly scheduler: SchedulerService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const monitors = await this.db.monitor.findMany({ where: { isActive: true } });
    for (const monitor of monitors) this.scheduler.startMonitor(this.toSpec(monitor));
    if (monitors.length > 0) this.logger.log(`Engine started ${monitors.length} monitor(s)`);
  }

  async start(monitorId: string): Promise<void> {
    const monitor = await this.db.monitor.findUnique({ where: { id: monitorId } });
    if (monitor?.isActive) this.scheduler.startMonitor(this.toSpec(monitor));
  }

  async restart(monitorId: string): Promise<void> {
    const monitor = await this.db.monitor.findUnique({ where: { id: monitorId } });
    if (monitor?.isActive) this.scheduler.restartMonitor(this.toSpec(monitor));
    else this.scheduler.stopMonitor(monitorId);
  }

  stop(monitorId: string): void {
    this.scheduler.stopMonitor(monitorId);
  }

  private toSpec(monitor: MonitorRow): MonitorSpec {
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
      initialStatus: monitor.status as MonitorStatus,
    };
  }
}
