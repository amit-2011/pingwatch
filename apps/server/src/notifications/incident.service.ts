import { Inject, Injectable } from '@nestjs/common';
import type { PingWatchPrismaClient } from '@pingwatch/db';
import { PRISMA_CLIENT } from '../common/di-tokens';

/**
 * Incident lifecycle (PLAN §4.3): exactly ONE open incident per monitor — the find-or-create on a
 * confirmed DOWN is the structural debounce. A confirmed UP resolves it.
 */
@Injectable()
export class IncidentService {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PingWatchPrismaClient) {}

  async openOnDown(monitorId: string, cause: string): Promise<{ id: string } | null> {
    const monitor = await this.db.monitor.findUnique({
      where: { id: monitorId },
      select: { organizationId: true, name: true },
    });
    if (!monitor) return null;

    const existing = await this.db.incident.findFirst({
      where: { monitorId, status: { not: 'resolved' } },
      select: { id: true },
    });
    if (existing) return existing; // idempotent — one open incident per monitor

    const incident = await this.db.incident.create({
      data: {
        organizationId: monitor.organizationId,
        monitorId,
        status: 'open',
        severity: 'major',
        title: `${monitor.name} is down`,
        cause,
      },
      select: { id: true },
    });
    await this.db.incidentUpdate.create({
      data: { incidentId: incident.id, kind: 'opened', message: cause, status: 'open' },
    });
    return incident;
  }

  async resolveOnUp(monitorId: string): Promise<{ id: string } | null> {
    const open = await this.db.incident.findFirst({
      where: { monitorId, status: { not: 'resolved' } },
      select: { id: true },
    });
    if (!open) return null;

    await this.db.incident.update({
      where: { id: open.id },
      data: { status: 'resolved', resolvedAt: new Date() },
    });
    await this.db.incidentUpdate.create({
      data: { incidentId: open.id, kind: 'resolved', status: 'resolved' },
    });
    return open;
  }
}
