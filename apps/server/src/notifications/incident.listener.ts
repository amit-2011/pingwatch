import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { MonitorTypeId, NotificationEvent } from '@pingwatch/shared';
import type { PingWatchPrismaClient } from '@pingwatch/db';
import { PRISMA_CLIENT } from '../common/di-tokens';
import { MONITOR_TRANSITION_EVENT, type MonitorTransitionEvent } from '../engine/scheduler.types';
import { DispatchService } from './dispatch.service';
import { IncidentService } from './incident.service';

/**
 * Bridges the engine to incidents + notifications (PLAN §4.3). On a CONFIRMED transition it
 * opens/resolves the incident and dispatches to the monitor's channels. Never throws back into
 * the emitter — a notification failure must not affect monitoring.
 */
@Injectable()
export class IncidentListener {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly db: PingWatchPrismaClient,
    private readonly incidents: IncidentService,
    private readonly dispatch: DispatchService,
  ) {}

  @OnEvent(MONITOR_TRANSITION_EVENT)
  async onTransition(transition: MonitorTransitionEvent): Promise<void> {
    const monitor = await this.db.monitor.findUnique({ where: { id: transition.monitorId } });
    if (!monitor) return;

    let target: string | undefined;
    try {
      const parsed = JSON.parse(monitor.config) as { url?: string };
      target = parsed.url;
    } catch {
      target = undefined;
    }

    const incident =
      transition.to === 'down'
        ? await this.incidents.openOnDown(monitor.id, transition.result.message)
        : await this.incidents.resolveOnUp(monitor.id);

    const event: NotificationEvent = {
      type: transition.to,
      organizationId: monitor.organizationId,
      monitor: { id: monitor.id, name: monitor.name, type: monitor.type as MonitorTypeId, target },
      status: transition.to,
      message: transition.result.message,
      occurredAt: new Date(transition.at).toISOString(),
      incidentId: incident?.id,
    };

    await this.dispatch.dispatchToMonitor(monitor.id, transition.to, event);

    // Record the notification time so the repeat-notify cron knows when to re-alert (P2.6).
    if (transition.to === 'down' && incident) {
      await this.db.incident.update({
        where: { id: incident.id },
        data: { lastNotifiedAt: new Date(transition.at), notifyCount: { increment: 1 } },
      });
    }
  }
}
