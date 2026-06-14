import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateStatusPageInput,
  IncidentSeverity,
  IncidentStatus,
  MonitorStatus,
  PublicIncident,
  PublicStatusPage,
  StatusPageAdminView,
  UpdateStatusPageInput,
} from '@pingwatch/shared';
import type { PingWatchPrismaClient, Prisma } from '@pingwatch/db';
import { PRISMA_CLIENT } from '../common/di-tokens';
import { DomainException } from '../common/domain.exception';

interface PageRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  themeColor: string | null;
  isPublished: boolean;
}

/** How long a resolved incident lingers on the public page before dropping off. */
const RESOLVED_VISIBLE_MS = 48 * 60 * 60 * 1000;

/** Internal update kinds are remapped to safe, generic public copy — the raw cause never leaks. */
const PUBLIC_UPDATE_COPY: Record<string, string> = {
  opened: 'We are investigating an issue affecting this service.',
  acknowledged: 'The issue has been identified and is being worked on.',
  resolved: 'This incident has been resolved.',
};

@Injectable()
export class StatusPageService {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PingWatchPrismaClient) {}

  async create(organizationId: string, input: CreateStatusPageInput): Promise<StatusPageAdminView> {
    const page = await this.db.statusPage.create({
      data: {
        organizationId,
        slug: randomBytes(12).toString('base64url'),
        title: input.title,
        description: input.description ?? null,
        themeColor: input.themeColor ?? null,
        isPublished: input.isPublished,
      },
    });
    await this.syncItems(page.id, organizationId, input.monitorIds);
    return this.toAdminView(page, input.monitorIds);
  }

  async list(organizationId: string): Promise<StatusPageAdminView[]> {
    const pages = await this.db.statusPage.findMany({
      where: { organizationId },
      include: { items: { select: { monitorId: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return pages.map((p) => this.toAdminView(p, p.items.map((i) => i.monitorId)));
  }

  async update(organizationId: string, id: string, input: UpdateStatusPageInput): Promise<StatusPageAdminView> {
    await this.require(organizationId, id);
    const data: Prisma.StatusPageUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.themeColor !== undefined) data.themeColor = input.themeColor;
    if (input.isPublished !== undefined) data.isPublished = input.isPublished;

    const page = await this.db.statusPage.update({ where: { id }, data });
    if (input.monitorIds !== undefined) await this.syncItems(id, organizationId, input.monitorIds);
    const items = await this.db.statusPageItem.findMany({ where: { statusPageId: id }, select: { monitorId: true } });
    return this.toAdminView(page, items.map((i) => i.monitorId));
  }

  async remove(organizationId: string, id: string): Promise<void> {
    await this.require(organizationId, id);
    await this.db.statusPage.delete({ where: { id } });
  }

  /** Anonymous, curated projection — no internal ids, no config. Null if missing/unpublished. */
  async publicProjection(slug: string): Promise<PublicStatusPage | null> {
    const page = await this.db.statusPage.findUnique({
      where: { slug },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          include: {
            monitor: { select: { id: true, name: true, status: true, uptime24h: true, uptime30d: true } },
          },
        },
      },
    });
    if (!page || !page.isPublished) return null;

    const items = page.items.map((i) => ({
      name: i.displayName ?? i.monitor.name,
      status: i.monitor.status as MonitorStatus,
      uptime24h: i.monitor.uptime24h,
      uptime30d: i.monitor.uptime30d,
    }));
    const overall: PublicStatusPage['overall'] = items.some((i) => i.status === 'down')
      ? 'down'
      : items.some((i) => i.status === 'pending' || i.status === 'maintenance')
        ? 'degraded'
        : 'operational';

    const incidents = await this.publicIncidents(
      page.organizationId,
      page.items.map((i) => i.monitor.id),
    );
    return { title: page.title, description: page.description, themeColor: page.themeColor, overall, items, incidents };
  }

  /** Published incidents for the page's monitors that are active or resolved within the visible window. */
  private async publicIncidents(organizationId: string, monitorIds: string[]): Promise<PublicIncident[]> {
    if (monitorIds.length === 0) return [];
    const cutoff = new Date(Date.now() - RESOLVED_VISIBLE_MS);
    const incidents = await this.db.incident.findMany({
      where: {
        organizationId,
        monitorId: { in: monitorIds },
        isPublished: true,
        OR: [{ resolvedAt: null }, { resolvedAt: { gte: cutoff } }],
      },
      orderBy: { startedAt: 'desc' },
      include: { updates: { orderBy: { createdAt: 'asc' } } },
    });

    return incidents.map((inc) => ({
      title: inc.title,
      severity: inc.severity as IncidentSeverity,
      status: inc.status as IncidentStatus,
      startedAt: inc.startedAt.toISOString(),
      resolvedAt: inc.resolvedAt?.toISOString() ?? null,
      updates: inc.updates.flatMap((u) => {
        // Admin comments pass through verbatim; lifecycle kinds use safe generic copy; rest are dropped.
        const message = u.kind === 'comment' ? u.message?.trim() : PUBLIC_UPDATE_COPY[u.kind];
        return message ? [{ message, createdAt: u.createdAt.toISOString() }] : [];
      }),
    }));
  }

  private async syncItems(statusPageId: string, organizationId: string, monitorIds: string[]): Promise<void> {
    const valid = await this.db.monitor.findMany({
      where: { id: { in: monitorIds }, organizationId },
      select: { id: true, name: true },
    });
    await this.db.$transaction([
      this.db.statusPageItem.deleteMany({ where: { statusPageId } }),
      ...valid.map((m, idx) =>
        this.db.statusPageItem.create({
          data: { statusPageId, monitorId: m.id, displayName: m.name, sortOrder: idx },
        }),
      ),
    ]);
  }

  private async require(organizationId: string, id: string): Promise<void> {
    const page = await this.db.statusPage.findFirst({ where: { id, organizationId }, select: { id: true } });
    if (!page) throw new DomainException('NOT_FOUND', 'Status page not found', 404);
  }

  private toAdminView(page: PageRow, monitorIds: string[]): StatusPageAdminView {
    return {
      id: page.id,
      slug: page.slug,
      title: page.title,
      description: page.description,
      themeColor: page.themeColor,
      isPublished: page.isPublished,
      monitorIds,
      publicUrl: `/status/${page.slug}`,
    };
  }
}
