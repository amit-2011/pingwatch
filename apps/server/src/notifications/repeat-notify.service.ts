import { Inject, Injectable, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { MonitorTypeId, NotificationEvent } from '@pingwatch/shared';
import type { PingWatchPrismaClient } from '@pingwatch/db';
import { PRISMA_CLIENT } from '../common/di-tokens';
import { LeaderElectionService } from '../engine/bullmq/leader-election.service';
import { EscalationService } from '../escalation/escalation.service';
import { MaintenanceService } from '../maintenance/maintenance.service';
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
    private readonly maintenance: MaintenanceService,
    private readonly escalation: EscalationService,
    @Optional() private readonly leader?: LeaderElectionService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async scan(): Promise<void> {
    // Cluster-singleton: in bullmq mode only the leader runs repeat-notify + escalation.
    if (this.leader && !this.leader.isLeader()) return;
    const now = Date.now();
    const incidents = (await this.db.incident.findMany({
      where: { status: { not: 'resolved' } },
      include: { monitor: { select: { name: true, type: true, config: true } } },
    })) as unknown as OpenIncident[];

    for (const incident of incidents) {
      // Mute repeat alerts while the monitor is under a maintenance window (P3.7).
      if (await this.maintenance.isUnderMaintenance(incident.organizationId, incident.monitorId)) continue;

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

      // Atomically claim this re-notify window before dispatching — guards against a transient
      // dual-leader double-page (the claim only succeeds if lastNotifiedAt is still what we read).
      const claimed = await this.db.incident.updateMany({
        where: {
          id: incident.id,
          status: { not: 'resolved' },
          lastNotifiedAt: incident.lastNotifiedAt,
        },
        data: { lastNotifiedAt: new Date(now), notifyCount: { increment: 1 } },
      });
      if (claimed.count === 0) continue;

      const event = this.buildEvent(incident);
      for (const link of due) await this.dispatch.deliver(link.channel, event);
    }

    // P4.3: page the next escalation step for any incident that has gone too long unacknowledged.
    await this.escalation.escalateDueIncidents(now);
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
