import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { MonitorTypeId, NotificationEvent } from '@pingwatch/shared';
import type { PingWatchPrismaClient } from '@pingwatch/db';
import { PRISMA_CLIENT } from '../common/di-tokens';
import { DispatchService } from './dispatch.service';

const MINUTE_MS = 60 * 1000;

interface OpenIncident {
  id: string;
  organizationId: string;
  monitorId: string;
  cause: string | null;
  lastNotifiedAt: Date | null;
  monitor: { name: string; type: string; config: string };
}

/**
 * Re-notifies for incidents that stay open (PLAN §4.3 / P2.6). Each minute, for every open
 * incident whose linked channels have a `resendEveryMin` cadence that has elapsed since the last
 * notification, it re-dispatches a `repeat` alert and advances `lastNotifiedAt`.
 */
@Injectable()
export class RepeatNotifyService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly db: PingWatchPrismaClient,
    private readonly dispatch: DispatchService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async scan(): Promise<void> {
    const now = Date.now();
    const incidents = (await this.db.incident.findMany({
      where: { status: { not: 'resolved' } },
      include: { monitor: { select: { name: true, type: true, config: true } } },
    })) as unknown as OpenIncident[];

    for (const incident of incidents) {
      const links = await this.db.monitorNotification.findMany({
        where: { monitorId: incident.monitorId },
        include: { channel: true },
      });
      const due = links.filter(
        (l) =>
          l.channel.isActive &&
          l.resendEveryMin !== null &&
          l.notifyOn.split(',').includes('repeat') &&
          (incident.lastNotifiedAt === null ||
            now - incident.lastNotifiedAt.getTime() >= l.resendEveryMin * MINUTE_MS),
      );
      if (due.length === 0) continue;

      const event = this.buildEvent(incident);
      for (const link of due) await this.dispatch.deliver(link.channel, event);
      await this.db.incident.update({
        where: { id: incident.id },
        data: { lastNotifiedAt: new Date(now), notifyCount: { increment: 1 } },
      });
    }
  }

  private buildEvent(incident: OpenIncident): NotificationEvent {
    let target: string | undefined;
    try {
      target = (JSON.parse(incident.monitor.config) as { url?: string }).url;
    } catch {
      target = undefined;
    }
    return {
      type: 'repeat',
      organizationId: incident.organizationId,
      monitor: { id: incident.monitorId, name: incident.monitor.name, type: incident.monitor.type as MonitorTypeId, target },
      status: 'down',
      message: incident.cause ?? 'Still down',
      occurredAt: new Date().toISOString(),
      incidentId: incident.id,
    };
  }
}
