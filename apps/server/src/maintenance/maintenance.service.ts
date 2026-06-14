import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateMaintenanceWindowInput,
  MaintenanceWindowView,
  UpdateMaintenanceWindowInput,
} from '@pingwatch/shared';
import type { PingWatchPrismaClient, Prisma } from '@pingwatch/db';
import { PRISMA_CLIENT } from '../common/di-tokens';
import { DomainException } from '../common/domain.exception';

type WindowRow = Prisma.MaintenanceWindowGetPayload<{ include: { monitor: { select: { name: true } } } }>;

/**
 * Maintenance windows (P3.7): schedule planned downtime so it never pages anyone. The engine keeps
 * checking and recording heartbeats; only the alerting paths consult {@link isUnderMaintenance} and
 * stay silent. A window with monitorId = null covers every monitor in the org.
 */
@Injectable()
export class MaintenanceService {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PingWatchPrismaClient) {}

  async list(organizationId: string): Promise<MaintenanceWindowView[]> {
    const windows = await this.db.maintenanceWindow.findMany({
      where: { organizationId },
      orderBy: { startsAt: 'desc' },
      include: { monitor: { select: { name: true } } },
    });
    const now = Date.now();
    return windows.map((w) => this.toView(w, now));
  }

  async create(organizationId: string, input: CreateMaintenanceWindowInput): Promise<MaintenanceWindowView> {
    await this.assertMonitor(organizationId, input.monitorId);
    const window = await this.db.maintenanceWindow.create({
      data: {
        organizationId,
        monitorId: input.monitorId,
        title: input.title,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
      },
      include: { monitor: { select: { name: true } } },
    });
    return this.toView(window, Date.now());
  }

  async update(
    organizationId: string,
    id: string,
    input: UpdateMaintenanceWindowInput,
  ): Promise<MaintenanceWindowView> {
    const existing = await this.require(organizationId, id);
    const startsAt = input.startsAt ? new Date(input.startsAt) : existing.startsAt;
    const endsAt = input.endsAt ? new Date(input.endsAt) : existing.endsAt;
    if (endsAt <= startsAt) {
      throw new DomainException('VALIDATION_ERROR', 'endsAt must be after startsAt', 400);
    }
    if (input.monitorId !== undefined) await this.assertMonitor(organizationId, input.monitorId);

    const data: Prisma.MaintenanceWindowUpdateInput = { startsAt, endsAt };
    if (input.title !== undefined) data.title = input.title;
    if (input.monitorId !== undefined) {
      data.monitor = input.monitorId ? { connect: { id: input.monitorId } } : { disconnect: true };
    }
    const window = await this.db.maintenanceWindow.update({
      where: { id },
      data,
      include: { monitor: { select: { name: true } } },
    });
    return this.toView(window, Date.now());
  }

  async remove(organizationId: string, id: string): Promise<void> {
    await this.require(organizationId, id);
    await this.db.maintenanceWindow.delete({ where: { id } });
  }

  /** True if an active window currently covers this monitor (directly or org-wide). */
  async isUnderMaintenance(organizationId: string, monitorId: string, at: Date = new Date()): Promise<boolean> {
    const count = await this.db.maintenanceWindow.count({
      where: {
        organizationId,
        startsAt: { lte: at },
        endsAt: { gte: at },
        OR: [{ monitorId: null }, { monitorId }],
      },
    });
    return count > 0;
  }

  private async assertMonitor(organizationId: string, monitorId: string | null): Promise<void> {
    if (monitorId == null) return;
    const monitor = await this.db.monitor.findFirst({
      where: { id: monitorId, organizationId },
      select: { id: true },
    });
    if (!monitor) throw new DomainException('NOT_FOUND', 'Monitor not found', 404);
  }

  private async require(organizationId: string, id: string): Promise<WindowRow> {
    const window = await this.db.maintenanceWindow.findFirst({
      where: { id, organizationId },
      include: { monitor: { select: { name: true } } },
    });
    if (!window) throw new DomainException('NOT_FOUND', 'Maintenance window not found', 404);
    return window;
  }

  private toView(w: WindowRow, now: number): MaintenanceWindowView {
    return {
      id: w.id,
      title: w.title,
      monitorId: w.monitorId,
      monitorName: w.monitor?.name ?? null,
      startsAt: w.startsAt.toISOString(),
      endsAt: w.endsAt.toISOString(),
      isActive: w.startsAt.getTime() <= now && w.endsAt.getTime() >= now,
    };
  }
}
