import { Inject, Injectable } from '@nestjs/common';
import { HEARTBEAT_STATUS } from '@pingwatch/shared';
import type { CreateMonitorInput, MonitorStatus, UpdateMonitorInput } from '@pingwatch/shared';
import type { PingWatchPrismaClient, Prisma } from '@pingwatch/db';
import { PRISMA_CLIENT } from '../common/di-tokens';
import { DomainException } from '../common/domain.exception';
import { DAY_MS, HOUR_MS } from '../engine/time-buckets';
import { MonitorEngineService } from '../engine/monitor-engine.service';

interface MonitorRecord {
  id: string;
  projectId: string;
  name: string;
  type: string;
  config: string;
  intervalSeconds: number;
  retries: number;
  retryIntervalSeconds: number;
  timeoutMs: number;
  isActive: boolean;
  status: string;
  lastCheckedAt: Date | null;
  lastStatusChangeAt: Date | null;
  lastResponseTime: number | null;
  uptime24h: number | null;
  uptime7d: number | null;
  uptime30d: number | null;
  createdAt: Date;
}

export interface MonitorView extends Omit<MonitorRecord, 'config' | 'status'> {
  status: MonitorStatus;
  config: unknown;
  notifyChannelIds?: string[];
  resendEveryMin?: number | null;
  /** Last ~40 beat statuses, oldest→newest, for the list sparkline (list endpoint only). */
  recentBeats?: number[];
}

/** Chart range selector values. Short ranges read raw heartbeats; long ranges read rollups. */
export const MONITOR_HISTORY_RANGES = ['recent', '3h', '6h', '24h', '1w', '1y'] as const;
export type MonitorHistoryRange = (typeof MONITOR_HISTORY_RANGES)[number];

/** Normalized response-time chart point — one raw beat (short ranges) or one rollup bucket (long ranges). */
export interface HistoryPoint {
  t: number; // epoch ms (beat time, or bucket start)
  avg: number | null; // avg response time (ms); null when there was no successful sample
  min: number | null;
  max: number | null;
  up: number; // up count (1 for a raw up beat; upCount for a bucket)
  down: number; // down count (drives the red band)
  maint: number; // maintenance count (drives the blue band)
  pending: number; // pending count (drives the amber band); raw beats only — rollups don't track it
}

function beatToPoint(b: { status: number; responseTime: number | null; createdAt: Date }): HistoryPoint {
  const t = b.createdAt.getTime();
  if (b.status === HEARTBEAT_STATUS.UP) {
    return { t, avg: b.responseTime, min: b.responseTime, max: b.responseTime, up: 1, down: 0, maint: 0, pending: 0 };
  }
  if (b.status === HEARTBEAT_STATUS.DOWN) return { t, avg: null, min: null, max: null, up: 0, down: 1, maint: 0, pending: 0 };
  if (b.status === HEARTBEAT_STATUS.MAINTENANCE) return { t, avg: null, min: null, max: null, up: 0, down: 0, maint: 1, pending: 0 };
  return { t, avg: null, min: null, max: null, up: 0, down: 0, maint: 0, pending: 1 }; // PENDING → amber band
}

function bucketToPoint(r: {
  bucket: Date;
  avgResponseTime: number | null;
  minResponseTime: number | null;
  maxResponseTime: number | null;
  upCount: number;
  downCount: number;
  maintenanceCount: number;
}): HistoryPoint {
  // The rollup's avg/min/max fold in DOWN beats' connect-failure times, so they're only meaningful
  // when the bucket had successful samples. With no up beats, null them so the line breaks (gap)
  // under the red band — consistent with the raw-beat path.
  const hasUp = r.upCount > 0;
  return {
    t: r.bucket.getTime(),
    avg: hasUp ? r.avgResponseTime : null,
    min: hasUp ? r.minResponseTime : null,
    max: hasUp ? r.maxResponseTime : null,
    up: r.upCount,
    down: r.downCount,
    maint: r.maintenanceCount,
    pending: 0, // rollups don't track pending (it's transient); only raw-beat ranges show amber
  };
}

@Injectable()
export class MonitorService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly db: PingWatchPrismaClient,
    private readonly engine: MonitorEngineService,
  ) {}

  async list(organizationId: string): Promise<MonitorView[]> {
    const monitors = await this.db.monitor.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
    // Attach a small recent-beat window per monitor for the list sparkline (oldest→newest).
    const beatsByMonitor = await Promise.all(
      monitors.map((m) =>
        this.db.heartbeat.findMany({
          where: { monitorId: m.id },
          orderBy: { createdAt: 'desc' },
          take: 40,
          select: { status: true },
        }),
      ),
    );
    return monitors.map((m, i) => ({
      ...this.toView(m),
      recentBeats: beatsByMonitor[i]!.map((b) => b.status).reverse(),
    }));
  }

  async get(organizationId: string, id: string): Promise<MonitorView> {
    const monitor = await this.requireMonitor(organizationId, id);
    const links = await this.db.monitorNotification.findMany({
      where: { monitorId: id },
      select: { channelId: true, resendEveryMin: true },
    });
    return {
      ...this.toView(monitor),
      notifyChannelIds: links.map((l) => l.channelId),
      resendEveryMin: links[0]?.resendEveryMin ?? null,
    };
  }

  async create(organizationId: string, input: CreateMonitorInput): Promise<MonitorView> {
    const project = await this.db.project.findFirst({
      where: { id: input.projectId, organizationId },
      select: { id: true },
    });
    if (!project) throw new DomainException('VALIDATION_ERROR', 'Project not found', 400);

    const monitor = await this.db.monitor.create({
      data: {
        organizationId,
        projectId: input.projectId,
        name: input.name,
        type: input.type,
        config: JSON.stringify(input.config),
        intervalSeconds: input.intervalSeconds,
        retries: input.retries,
        retryIntervalSeconds: input.retryIntervalSeconds,
        timeoutMs: input.timeoutMs,
        isActive: input.isActive,
        status: 'pending',
      },
    });
    await this.syncChannels(monitor.id, organizationId, input.notifyChannelIds, input.resendEveryMin ?? null);
    await this.engine.start(monitor.id);
    return this.toView(monitor);
  }

  async update(organizationId: string, id: string, input: UpdateMonitorInput): Promise<MonitorView> {
    await this.requireMonitor(organizationId, id);
    const data: Prisma.MonitorUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.intervalSeconds !== undefined) data.intervalSeconds = input.intervalSeconds;
    if (input.retries !== undefined) data.retries = input.retries;
    if (input.retryIntervalSeconds !== undefined) data.retryIntervalSeconds = input.retryIntervalSeconds;
    if (input.timeoutMs !== undefined) data.timeoutMs = input.timeoutMs;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.config !== undefined) data.config = JSON.stringify(input.config);

    const monitor = await this.db.monitor.update({ where: { id }, data });
    if (input.notifyChannelIds !== undefined) {
      await this.syncChannels(id, organizationId, input.notifyChannelIds, input.resendEveryMin ?? null);
    }
    await this.engine.restart(monitor.id);
    return this.toView(monitor);
  }

  /** Replace the monitor's notification channel links (validated to the org). */
  private async syncChannels(
    monitorId: string,
    organizationId: string,
    channelIds: string[],
    resendEveryMin: number | null,
  ): Promise<void> {
    const valid = await this.db.notificationChannel.findMany({
      where: { id: { in: channelIds }, organizationId },
      select: { id: true },
    });
    await this.db.$transaction([
      this.db.monitorNotification.deleteMany({ where: { monitorId } }),
      ...valid.map((c) =>
        this.db.monitorNotification.create({
          data: { monitorId, channelId: c.id, notifyOn: 'down,up,repeat', resendEveryMin },
        }),
      ),
    ]);
  }

  async setActive(organizationId: string, id: string, isActive: boolean): Promise<MonitorView> {
    await this.requireMonitor(organizationId, id);
    const monitor = await this.db.monitor.update({ where: { id }, data: { isActive } });
    if (isActive) await this.engine.restart(id);
    else this.engine.stop(id);
    return this.toView(monitor);
  }

  async remove(organizationId: string, id: string): Promise<void> {
    await this.requireMonitor(organizationId, id);
    this.engine.stop(id);
    await this.db.monitor.delete({ where: { id } });
  }

  async heartbeats(organizationId: string, id: string, limit: number): Promise<unknown[]> {
    await this.requireMonitor(organizationId, id);
    return this.db.heartbeat.findMany({
      where: { monitorId: id },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
      select: { status: true, responseTime: true, statusCode: true, message: true, important: true, createdAt: true },
    });
  }

  /**
   * Normalized response-time series for the chart. Short ranges (recent/3h/6h) read raw heartbeats
   * for a fine-grained line; long ranges (24h/1w/1y) read pre-aggregated rollups so the window stays
   * full and cheap regardless of how many raw beats exist (or have been purged past retention).
   */
  async history(organizationId: string, id: string, range: MonitorHistoryRange): Promise<HistoryPoint[]> {
    await this.requireMonitor(organizationId, id);
    const now = Date.now();
    const bucketSelect = {
      bucket: true,
      avgResponseTime: true,
      minResponseTime: true,
      maxResponseTime: true,
      upCount: true,
      downCount: true,
      maintenanceCount: true,
    } as const;

    if (range === 'recent' || range === '3h' || range === '6h') {
      const where: Prisma.HeartbeatWhereInput = { monitorId: id };
      if (range !== 'recent') where.createdAt = { gte: new Date(now - (range === '3h' ? 3 : 6) * HOUR_MS) };
      const beats = await this.db.heartbeat.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: range === 'recent' ? 100 : 1500,
        select: { status: true, responseTime: true, createdAt: true },
      });
      return beats.reverse().map(beatToPoint);
    }

    if (range === '24h' || range === '1w') {
      const since = new Date(now - (range === '24h' ? DAY_MS : 7 * DAY_MS));
      const rows = await this.db.statHourly.findMany({
        where: { monitorId: id, bucket: { gte: since } },
        orderBy: { bucket: 'asc' },
        select: bucketSelect,
      });
      return rows.map(bucketToPoint);
    }

    // '1y' → daily buckets
    const since = new Date(now - 365 * DAY_MS);
    const rows = await this.db.statDaily.findMany({
      where: { monitorId: id, bucket: { gte: since } },
      orderBy: { bucket: 'asc' },
      select: bucketSelect,
    });
    return rows.map(bucketToPoint);
  }

  async metrics(organizationId: string, id: string, limit: number): Promise<unknown[]> {
    await this.requireMonitor(organizationId, id);
    return this.db.metricSample.findMany({
      where: { monitorId: id },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
      select: { cpuPct: true, memPct: true, diskPct: true, netInKbps: true, netOutKbps: true, createdAt: true },
    });
  }

  private async requireMonitor(organizationId: string, id: string): Promise<MonitorRecord> {
    const monitor = await this.db.monitor.findFirst({ where: { id, organizationId } });
    if (!monitor) throw new DomainException('NOT_FOUND', 'Monitor not found', 404);
    return monitor;
  }

  private toView(monitor: MonitorRecord): MonitorView {
    const { config, status, ...rest } = monitor;
    let parsed: unknown = {};
    try {
      parsed = JSON.parse(config);
    } catch {
      parsed = {};
    }
    return { ...rest, status: status as MonitorStatus, config: parsed };
  }
}
