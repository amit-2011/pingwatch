import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { PingWatchPrismaClient, Prisma } from '@pingwatch/db';
import { PRISMA_CLIENT } from '../common/di-tokens';
import { MONITOR_BEAT_EVENT, type MonitorBeatEvent } from './scheduler.types';
import { UptimeRing } from './uptime-ring';

/**
 * Persists every beat (PLAN §3.6). All writes funnel through a SINGLE serialized path so SQLite
 * never sees concurrent writers. The denormalized `Monitor.status` + `lastStatusChangeAt` are
 * written ONLY on a confirmed transition; `lastCheckedAt`/`lastResponseTime`/`uptime24h` every beat.
 * A write failure logs but never flips status (a DB hiccup is not an outage).
 */
@Injectable()
export class HeartbeatWriterService {
  private readonly rings = new Map<string, UptimeRing>();
  private tail: Promise<unknown> = Promise.resolve();

  constructor(@Inject(PRISMA_CLIENT) private readonly db: PingWatchPrismaClient) {}

  ring(monitorId: string): UptimeRing {
    let ring = this.rings.get(monitorId);
    if (!ring) {
      ring = new UptimeRing();
      this.rings.set(monitorId, ring);
    }
    return ring;
  }

  @OnEvent(MONITOR_BEAT_EVENT)
  onBeat(beat: MonitorBeatEvent): Promise<void> {
    return this.serialize(() => this.persist(beat));
  }

  private async persist(beat: MonitorBeatEvent): Promise<void> {
    const ring = this.ring(beat.monitorId);
    ring.push(beat.at, beat.beatStatus, beat.coverageMs);

    await this.db.heartbeat.create({
      data: {
        monitorId: beat.monitorId,
        status: beat.beatStatus,
        responseTime: beat.result.responseTimeMs,
        statusCode: beat.result.statusCode ?? null,
        message: beat.result.message,
        important: beat.important,
        retryCount: beat.failCount,
        coverageMs: beat.coverageMs,
      },
    });

    const data: Prisma.MonitorUpdateInput = {
      lastCheckedAt: new Date(beat.at),
      lastResponseTime: beat.result.responseTimeMs,
      uptime24h: ring.uptimePct(beat.at),
    };
    if (beat.changed) {
      data.status = beat.status;
      data.lastStatusChangeAt = new Date(beat.at);
    }
    await this.db.monitor.update({ where: { id: beat.monitorId }, data });
  }

  /** Chain writes so only one runs at a time (single SQLite writer). */
  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.tail.then(fn, fn);
    this.tail = run.catch(() => undefined);
    return run;
  }
}
