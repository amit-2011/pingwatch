import { Inject, Injectable } from '@nestjs/common';
import type {
  IncidentSeverity,
  IncidentStatus,
  IncidentUpdateView,
  IncidentView,
  UpdateIncidentInput,
} from '@pingwatch/shared';
import type { PingWatchPrismaClient, Prisma } from '@pingwatch/db';
import { PRISMA_CLIENT } from '../common/di-tokens';
import { DomainException } from '../common/domain.exception';

type IncidentWithRelations = Prisma.IncidentGetPayload<{
  include: { monitor: { select: { name: true } }; updates: true };
}>;

/**
 * Human-facing incident workflow (P3.6): list the timeline, post comments, acknowledge, manually
 * resolve, and publish to the status page. The engine still owns automatic open/resolve
 * (see notifications/incident.service.ts) — this layer never fabricates the open/resolved lifecycle.
 */
@Injectable()
export class IncidentAdminService {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PingWatchPrismaClient) {}

  async list(organizationId: string): Promise<IncidentView[]> {
    const incidents = await this.db.incident.findMany({
      where: { organizationId },
      orderBy: { startedAt: 'desc' },
      include: { monitor: { select: { name: true } }, updates: { orderBy: { createdAt: 'asc' } } },
    });
    return incidents.map((i) => this.toView(i));
  }

  async get(organizationId: string, id: string): Promise<IncidentView> {
    return this.toView(await this.require(organizationId, id));
  }

  async comment(organizationId: string, id: string, message: string): Promise<IncidentView> {
    const incident = await this.require(organizationId, id);
    await this.db.incidentUpdate.create({
      data: { incidentId: id, kind: 'comment', message, status: incident.status },
    });
    return this.get(organizationId, id);
  }

  async acknowledge(organizationId: string, id: string, userId: string): Promise<IncidentView> {
    const incident = await this.require(organizationId, id);
    if (incident.status === 'resolved') {
      throw new DomainException('CONFLICT', 'Cannot acknowledge a resolved incident', 409);
    }
    if (incident.acknowledgedAt == null) {
      await this.db.incident.update({
        where: { id },
        data: { status: 'acknowledged', acknowledgedAt: new Date(), acknowledgedBy: userId },
      });
      await this.db.incidentUpdate.create({
        data: { incidentId: id, kind: 'acknowledged', status: 'acknowledged' },
      });
    }
    return this.get(organizationId, id);
  }

  async resolve(organizationId: string, id: string): Promise<IncidentView> {
    const incident = await this.require(organizationId, id);
    if (incident.status !== 'resolved') {
      await this.db.incident.update({
        where: { id },
        data: { status: 'resolved', resolvedAt: new Date() },
      });
      await this.db.incidentUpdate.create({
        data: { incidentId: id, kind: 'resolved', status: 'resolved' },
      });
    }
    return this.get(organizationId, id);
  }

  async update(organizationId: string, id: string, input: UpdateIncidentInput): Promise<IncidentView> {
    await this.require(organizationId, id);
    const data: Prisma.IncidentUpdateInput = {};
    if (input.severity !== undefined) data.severity = input.severity;
    if (input.isPublished !== undefined) data.isPublished = input.isPublished;
    await this.db.incident.update({ where: { id }, data });
    return this.get(organizationId, id);
  }

  private async require(organizationId: string, id: string): Promise<IncidentWithRelations> {
    const incident = await this.db.incident.findFirst({
      where: { id, organizationId },
      include: { monitor: { select: { name: true } }, updates: { orderBy: { createdAt: 'asc' } } },
    });
    if (!incident) throw new DomainException('NOT_FOUND', 'Incident not found', 404);
    return incident;
  }

  private toView(i: IncidentWithRelations): IncidentView {
    return {
      id: i.id,
      monitorId: i.monitorId,
      monitorName: i.monitor.name,
      status: i.status as IncidentStatus,
      severity: i.severity as IncidentSeverity,
      title: i.title,
      cause: i.cause,
      isPublished: i.isPublished,
      startedAt: i.startedAt.toISOString(),
      acknowledgedAt: i.acknowledgedAt?.toISOString() ?? null,
      resolvedAt: i.resolvedAt?.toISOString() ?? null,
      updates: i.updates.map(
        (u): IncidentUpdateView => ({
          id: u.id,
          kind: u.kind,
          message: u.message,
          status: u.status,
          createdAt: u.createdAt.toISOString(),
        }),
      ),
    };
  }
}
