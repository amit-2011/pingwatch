import { Inject, Injectable, Logger } from '@nestjs/common';
import type { MonitorTypeId, NotificationEvent } from '@pingwatch/shared';
import type { PingWatchPrismaClient } from '@pingwatch/db';
import { PRISMA_CLIENT } from '../common/di-tokens';
import { MaintenanceService } from '../maintenance/maintenance.service';
import { DispatchService } from '../notifications/dispatch.service';

interface OpenIncidentRow {
  id: string;
  organizationId: string;
  monitorId: string;
  cause: string | null;
  startedAt: Date;
  escalationPolicyId: string | null;
  lastEscalatedStep: number;
  monitor: { name: string; type: string; config: string };
}

/**
 * Escalation engine (P4.3): pages the next responder when an incident stays unacknowledged. Driven
 * once a minute from the existing incident scan (see RepeatNotifyService) so it inherits the same
 * single-instance cron seam. A step fires when `(now - startedAt) >= delayMinutes`; the
 * `lastEscalatedStep` guard makes each step idempotent, and acknowledge/resolve/maintenance halt it.
 */
@Injectable()
export class EscalationService {
  private readonly logger = new Logger(EscalationService.name);

  constructor(
    @Inject(PRISMA_CLIENT) private readonly db: PingWatchPrismaClient,
    private readonly dispatch: DispatchService,
    private readonly maintenance: MaintenanceService,
  ) {}

  async escalateDueIncidents(nowMs: number): Promise<void> {
    const incidents = (await this.db.incident.findMany({
      where: { status: 'open', acknowledgedAt: null, escalationPolicyId: { not: null } },
      include: { monitor: { select: { name: true, type: true, config: true } } },
    })) as unknown as OpenIncidentRow[];

    for (const incident of incidents) {
      try {
        await this.escalateOne(incident, nowMs);
      } catch (err) {
        // A failed escalation must never break the scan for other incidents.
        this.logger.warn(`Escalation for incident ${incident.id} failed: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  private async escalateOne(incident: OpenIncidentRow, nowMs: number): Promise<void> {
    if (incident.escalationPolicyId === null) return;
    if (await this.maintenance.isUnderMaintenance(incident.organizationId, incident.monitorId)) return;

    const policy = await this.db.escalationPolicy.findFirst({
      where: { id: incident.escalationPolicyId, isActive: true },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    if (!policy) return;

    const elapsedMinutes = (nowMs - incident.startedAt.getTime()) / 60_000;
    const dueSteps = policy.steps.filter(
      (s) => s.stepOrder > incident.lastEscalatedStep && s.delayMinutes <= elapsedMinutes,
    );
    if (dueSteps.length === 0) return;

    const event = this.buildEvent(incident);
    let highestFired = incident.lastEscalatedStep;

    for (const step of dueSteps) {
      const ids = step.channelIds.split(',').filter(Boolean);
      const channels = await this.db.notificationChannel.findMany({
        where: { organizationId: incident.organizationId, id: { in: ids }, isActive: true },
      });
      for (const channel of channels) await this.dispatch.deliver(channel, event);
      await this.db.incidentUpdate.create({
        data: {
          incidentId: incident.id,
          kind: 'escalated',
          message: `Escalated to step ${step.stepOrder}`,
          meta: JSON.stringify({ stepOrder: step.stepOrder, channelIds: ids }),
          status: 'open',
        },
      });
      highestFired = Math.max(highestFired, step.stepOrder);
    }

    await this.db.incident.update({
      where: { id: incident.id },
      data: { lastEscalatedStep: highestFired },
    });
  }

  /** A `repeat`-type event — escalation is a re-page, so existing providers/templates handle it. */
  private buildEvent(incident: OpenIncidentRow): NotificationEvent {
    let target: string | undefined;
    try {
      target = (JSON.parse(incident.monitor.config) as { url?: string }).url;
    } catch {
      target = undefined;
    }
    return {
      type: 'repeat',
      organizationId: incident.organizationId,
      monitor: {
        id: incident.monitorId,
        name: incident.monitor.name,
        type: incident.monitor.type as MonitorTypeId,
        target,
      },
      status: 'down',
      message: incident.cause ?? 'Still down',
      occurredAt: new Date().toISOString(),
      incidentId: incident.id,
    };
  }
}
