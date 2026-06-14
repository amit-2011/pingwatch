import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HEARTBEAT_STATUS } from '@pingwatch/shared';
import type { PingWatchPrismaClient } from '@pingwatch/db';
import { PINGWATCH_CONFIG, PRISMA_CLIENT } from '../common/di-tokens';
import type { ResolvedConfig } from '../config/schema';
import { DAY_MS, HOUR_MS, truncToDay, truncToHour } from './time-buckets';

interface Bucket {
  upCount: number;
  downCount: number;
  maintenanceCount: number;
  upMs: number;
  downMs: number;
  rtSum: number;
  rtCount: number;
  rtMin: number | null;
  rtMax: number | null;
}

interface BeatRow {
  status: number;
  responseTime: number | null;
  coverageMs: number;
}

function accumulate(bucket: Bucket, beat: BeatRow): void {
  if (beat.status === HEARTBEAT_STATUS.UP) {
    bucket.upCount += 1;
    bucket.upMs += beat.coverageMs;
  } else if (beat.status === HEARTBEAT_STATUS.DOWN) {
    bucket.downCount += 1;
    bucket.downMs += beat.coverageMs;
  } else if (beat.status === HEARTBEAT_STATUS.MAINTENANCE) {
    bucket.maintenanceCount += 1;
  }
  // PENDING beats are transient and excluded from up/down.
  if (beat.responseTime !== null) {
    bucket.rtSum += beat.responseTime;
    bucket.rtCount += 1;
    bucket.rtMin = bucket.rtMin === null ? beat.responseTime : Math.min(bucket.rtMin, beat.responseTime);
    bucket.rtMax = bucket.rtMax === null ? beat.responseTime : Math.max(bucket.rtMax, beat.responseTime);
  }
}

function pct(up: number | null, down: number | null): number | null {
  const total = (up ?? 0) + (down ?? 0);
  return total > 0 ? ((up ?? 0) / total) * 100 : null;
}

/**
 * Aggregates raw heartbeats into hourly + daily rollups (PLAN §3.8). Re-aggregates only buckets
 * touched since a per-monitor watermark (overwrite, not increment — avoids running-average drift).
 * Raw heartbeats older than retention are purged ONLY after a successful aggregation pass — a
 * failing cron can never delete un-aggregated data.
 */
@Injectable()
export class RollupService {
  private readonly logger = new Logger(RollupService.name);
  private readonly watermarks = new Map<string, Date>();
  private lastSuccessAt: number | null = null;
  private running = false;

  constructor(
    @Inject(PRISMA_CLIENT) private readonly db: PingWatchPrismaClient,
    @Inject(PINGWATCH_CONFIG) private readonly config: ResolvedConfig,
  ) {}

  getLastSuccessAt(): number | null {
    return this.lastSuccessAt;
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async rollupAll(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const monitors = await this.db.monitor.findMany({ select: { id: true } });
      for (const monitor of monitors) await this.rollupMonitor(monitor.id);
      this.lastSuccessAt = Date.now();
    } finally {
      this.running = false;
    }
  }

  async rollupMonitor(monitorId: string): Promise<void> {
    const watermark = this.watermarks.get(monitorId) ?? new Date(0);
    const newBeats = await this.db.heartbeat.findMany({
      where: { monitorId, createdAt: { gt: watermark } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    if (newBeats.length === 0) return;

    const hourBuckets = new Set(newBeats.map((b) => truncToHour(b.createdAt).getTime()));
    const dayBuckets = new Set(newBeats.map((b) => truncToDay(b.createdAt).getTime()));

    try {
      for (const ts of hourBuckets) await this.aggregateBucket(monitorId, 'hour', ts);
      for (const ts of dayBuckets) await this.aggregateBucket(monitorId, 'day', ts);
      this.watermarks.set(monitorId, newBeats[newBeats.length - 1]!.createdAt);
      await this.updateUptimeWindows(monitorId);
      await this.purge(monitorId);
    } catch (err) {
      this.logger.error(
        `Rollup failed for monitor ${monitorId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      // Leave the watermark; do NOT purge. Next run retries from the same point.
    }
  }

  private async aggregateBucket(monitorId: string, grain: 'hour' | 'day', bucketTs: number): Promise<void> {
    const start = new Date(bucketTs);
    const end = new Date(bucketTs + (grain === 'hour' ? HOUR_MS : DAY_MS));
    const beats = await this.db.heartbeat.findMany({
      where: { monitorId, createdAt: { gte: start, lt: end } },
      select: { status: true, responseTime: true, coverageMs: true },
    });

    const bucket: Bucket = { upCount: 0, downCount: 0, maintenanceCount: 0, upMs: 0, downMs: 0, rtSum: 0, rtCount: 0, rtMin: null, rtMax: null };
    for (const beat of beats) accumulate(bucket, beat);

    const row = {
      upCount: bucket.upCount,
      downCount: bucket.downCount,
      maintenanceCount: bucket.maintenanceCount,
      upMs: bucket.upMs,
      downMs: bucket.downMs,
      avgResponseTime: bucket.rtCount > 0 ? bucket.rtSum / bucket.rtCount : null,
      minResponseTime: bucket.rtMin,
      maxResponseTime: bucket.rtMax,
    };

    if (grain === 'hour') {
      await this.db.statHourly.upsert({
        where: { monitorId_bucket: { monitorId, bucket: start } },
        create: { monitorId, bucket: start, ...row },
        update: row,
      });
    } else {
      await this.db.statDaily.upsert({
        where: { monitorId_bucket: { monitorId, bucket: start } },
        create: { monitorId, bucket: start, ...row },
        update: row,
      });
    }
  }

  private async updateUptimeWindows(monitorId: string): Promise<void> {
    const now = Date.now();
    const [hourly, daily] = await Promise.all([
      this.db.statHourly.aggregate({
        where: { monitorId, bucket: { gte: new Date(now - 7 * DAY_MS) } },
        _sum: { upMs: true, downMs: true },
      }),
      this.db.statDaily.aggregate({
        where: { monitorId, bucket: { gte: new Date(now - 30 * DAY_MS) } },
        _sum: { upMs: true, downMs: true },
      }),
    ]);
    await this.db.monitor.update({
      where: { id: monitorId },
      data: {
        uptime7d: pct(hourly._sum.upMs, hourly._sum.downMs),
        uptime30d: pct(daily._sum.upMs, daily._sum.downMs),
      },
    });
  }

  private async purge(monitorId: string): Promise<void> {
    const cutoff = new Date(Date.now() - this.config.rawRetentionDays * DAY_MS);
    await this.db.heartbeat.deleteMany({ where: { monitorId, createdAt: { lt: cutoff } } });
  }
}
