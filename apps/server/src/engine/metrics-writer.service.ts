import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { PingWatchPrismaClient } from '@pingwatch/db';
import { PRISMA_CLIENT } from '../common/di-tokens';
import { MONITOR_BEAT_EVENT, type MonitorBeatEvent } from './scheduler.types';

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' ? v : null;
}

/** Persists a MetricSample for system-monitor beats (those whose meta carries metrics) — P3.2. */
@Injectable()
export class MetricsWriterService {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PingWatchPrismaClient) {}

  @OnEvent(MONITOR_BEAT_EVENT)
  async onBeat(beat: MonitorBeatEvent): Promise<void> {
    const meta = beat.result.meta;
    if (!meta || meta.isMetric !== true) return;
    await this.db.metricSample.create({
      data: {
        monitorId: beat.monitorId,
        cpuPct: numOrNull(meta.cpuPct),
        memPct: numOrNull(meta.memPct),
        diskPct: numOrNull(meta.diskPct),
        netInKbps: numOrNull(meta.netInKbps),
        netOutKbps: numOrNull(meta.netOutKbps),
      },
    });
  }
}
