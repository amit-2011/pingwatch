import { Inject, Injectable } from '@nestjs/common';
import type { ConfigBundle } from '@pingwatch/shared';
import { CONFIG_BUNDLE_VERSION } from '@pingwatch/shared';
import type { PingWatchPrismaClient } from '@pingwatch/db';
import { PRISMA_CLIENT } from '../common/di-tokens';

function safeConfig(json: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Builds a {@link ConfigBundle} for one org (P4.6). Channel secrets are ALWAYS redacted here —
 * the bundle never carries a plaintext secret nor the app-secret-bound `v1:` ciphertext (which is
 * unusable on another instance). References use stable keys (project slug, channel/monitor name).
 */
@Injectable()
export class ConfigExportService {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PingWatchPrismaClient) {}

  async export(organizationId: string): Promise<ConfigBundle> {
    const org = await this.db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, slug: true },
    });
    const projects = await this.db.project.findMany({
      where: { organizationId },
      select: { id: true, name: true, slug: true },
    });
    const projectSlugById = new Map(projects.map((p) => [p.id, p.slug]));

    const channels = await this.db.notificationChannel.findMany({
      where: { organizationId },
      select: { id: true, name: true, type: true, isActive: true },
    });
    const channelNameById = new Map(channels.map((c) => [c.id, c.name]));

    const monitors = await this.db.monitor.findMany({ where: { organizationId } });
    const links = await this.db.monitorNotification.findMany({
      where: { monitor: { organizationId } },
      select: { monitorId: true, channelId: true },
    });
    const channelsByMonitor = new Map<string, string[]>();
    for (const l of links) {
      const name = channelNameById.get(l.channelId);
      if (!name) continue;
      const arr = channelsByMonitor.get(l.monitorId) ?? [];
      arr.push(name);
      channelsByMonitor.set(l.monitorId, arr);
    }

    const statusPages = await this.db.statusPage.findMany({
      where: { organizationId },
      include: { items: { orderBy: { sortOrder: 'asc' }, include: { monitor: { select: { name: true } } } } },
    });
    const maintenanceWindows = await this.db.maintenanceWindow.findMany({
      where: { organizationId },
      include: { monitor: { select: { name: true } } },
    });

    return {
      version: CONFIG_BUNDLE_VERSION,
      exportedAt: new Date().toISOString(),
      org: org ? { name: org.name, slug: org.slug } : undefined,
      projects: projects.map((p) => ({ name: p.name, slug: p.slug })),
      channels: channels.map((c) => ({
        name: c.name,
        type: c.type as ConfigBundle['channels'][number]['type'],
        isActive: c.isActive,
        secret: { mode: 'redacted' as const },
      })),
      monitors: monitors.map((m) => ({
        projectSlug: projectSlugById.get(m.projectId) ?? '',
        name: m.name,
        type: m.type,
        config: safeConfig(m.config),
        intervalSeconds: m.intervalSeconds,
        retries: m.retries,
        retryIntervalSeconds: m.retryIntervalSeconds,
        timeoutMs: m.timeoutMs,
        isActive: m.isActive,
        notifyChannels: channelsByMonitor.get(m.id) ?? [],
      })),
      statusPages: statusPages.map((sp) => ({
        title: sp.title,
        description: sp.description,
        themeColor: sp.themeColor,
        isPublished: sp.isPublished,
        monitors: sp.items.map((i) => i.monitor.name),
      })),
      maintenanceWindows: maintenanceWindows.map((w) => ({
        title: w.title,
        monitor: w.monitor?.name ?? null,
        startsAt: w.startsAt.toISOString(),
        endsAt: w.endsAt.toISOString(),
      })),
    };
  }
}
