import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { ConfigBundle, ImportReport } from '@pingwatch/shared';
import type { PingWatchPrismaClient } from '@pingwatch/db';
import { PRISMA_CLIENT } from '../common/di-tokens';
import { SecretBoxService } from '../crypto/secret-box.service';
import { MonitorTypeRegistry } from '../engine/monitor-type.registry';
import { NotificationProviderRegistry } from '../notifications/notification-provider.registry';

/** Thrown to roll back the transaction after a dry run (the report is built before it fires). */
class DryRunRollback extends Error {}

function emptyReport(dryRun: boolean): ImportReport {
  const counts = () => ({ created: 0, updated: 0, skipped: 0 });
  return {
    dryRun,
    projects: counts(),
    channels: counts(),
    monitors: counts(),
    statusPages: counts(),
    maintenanceWindows: counts(),
    warnings: [],
  };
}

/**
 * Idempotent config import (P4.6). Upserts an org's config from a {@link ConfigBundle} keyed by
 * STABLE keys — project slug, channel/monitor/status-page/maintenance name+title — never internal
 * ids. The whole apply runs in one transaction; a dry run computes the report then rolls back.
 * Engine restarts are the CALLER's job (so the CLI can reuse this with no scheduler running).
 */
@Injectable()
export class ConfigImportService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly db: PingWatchPrismaClient,
    private readonly secretBox: SecretBoxService,
    private readonly monitorTypes: MonitorTypeRegistry,
    private readonly providers: NotificationProviderRegistry,
  ) {}

  async import(
    organizationId: string,
    bundle: ConfigBundle,
    dryRun: boolean,
  ): Promise<{ report: ImportReport; monitorIds: string[] }> {
    const report = emptyReport(dryRun);
    const affectedMonitorIds = new Set<string>();

    const run = async (tx: PingWatchPrismaClient): Promise<void> => {
      const projectIdBySlug = await this.upsertProjects(tx, organizationId, bundle, report);
      const channelIdByName = await this.upsertChannels(tx, organizationId, bundle, report);
      const monitorIdByName = await this.upsertMonitors(
        tx,
        organizationId,
        bundle,
        report,
        projectIdBySlug,
        channelIdByName,
        affectedMonitorIds,
      );
      await this.upsertStatusPages(tx, organizationId, bundle, report, monitorIdByName);
      await this.upsertMaintenance(tx, organizationId, bundle, report, monitorIdByName);
      if (dryRun) throw new DryRunRollback();
    };

    try {
      await this.db.$transaction(run as Parameters<PingWatchPrismaClient['$transaction']>[0]);
    } catch (err) {
      if (!(err instanceof DryRunRollback)) throw err;
    }
    return { report, monitorIds: [...affectedMonitorIds] };
  }

  private async upsertProjects(
    tx: PingWatchPrismaClient,
    organizationId: string,
    bundle: ConfigBundle,
    report: ImportReport,
  ): Promise<Map<string, string>> {
    const bySlug = new Map<string, string>();
    for (const p of bundle.projects) {
      const existing = await tx.project.findFirst({ where: { organizationId, slug: p.slug } });
      if (existing) {
        await tx.project.update({ where: { id: existing.id }, data: { name: p.name } });
        report.projects.updated += 1;
        bySlug.set(p.slug, existing.id);
      } else {
        const created = await tx.project.create({ data: { organizationId, name: p.name, slug: p.slug } });
        report.projects.created += 1;
        bySlug.set(p.slug, created.id);
      }
    }
    // Existing projects not named in the bundle are still valid monitor targets.
    for (const p of await tx.project.findMany({ where: { organizationId }, select: { id: true, slug: true } })) {
      if (!bySlug.has(p.slug)) bySlug.set(p.slug, p.id);
    }
    return bySlug;
  }

  private async upsertChannels(
    tx: PingWatchPrismaClient,
    organizationId: string,
    bundle: ConfigBundle,
    report: ImportReport,
  ): Promise<Map<string, string>> {
    const byName = new Map<string, string>();
    for (const c of bundle.channels) {
      const provider = this.providers.get(c.type);
      if (!provider) {
        report.warnings.push(`channel "${c.name}": unknown type ${c.type} — skipped`);
        report.channels.skipped += 1;
        continue;
      }
      let sealedConfig: string | null = null;
      if (c.secret.mode === 'plaintext') {
        try {
          provider.configSchema.parse(c.secret.config);
        } catch {
          report.warnings.push(`channel "${c.name}": invalid ${c.type} config — skipped`);
          report.channels.skipped += 1;
          continue;
        }
        sealedConfig = this.secretBox.seal(JSON.stringify(c.secret.config));
      }
      const existing = await tx.notificationChannel.findFirst({ where: { organizationId, name: c.name } });
      if (existing) {
        await tx.notificationChannel.update({
          where: { id: existing.id },
          data: { type: c.type, isActive: c.isActive, ...(sealedConfig ? { config: sealedConfig } : {}) },
        });
        report.channels.updated += 1;
        byName.set(c.name, existing.id);
      } else if (sealedConfig) {
        const created = await tx.notificationChannel.create({
          data: { organizationId, name: c.name, type: c.type, isActive: c.isActive, config: sealedConfig },
        });
        report.channels.created += 1;
        byName.set(c.name, created.id);
      } else {
        report.warnings.push(`channel "${c.name}": redacted secret — cannot create a new channel without its secret; skipped`);
        report.channels.skipped += 1;
      }
    }
    for (const c of await tx.notificationChannel.findMany({ where: { organizationId }, select: { id: true, name: true } })) {
      if (!byName.has(c.name)) byName.set(c.name, c.id);
    }
    return byName;
  }

  private async upsertMonitors(
    tx: PingWatchPrismaClient,
    organizationId: string,
    bundle: ConfigBundle,
    report: ImportReport,
    projectIdBySlug: Map<string, string>,
    channelIdByName: Map<string, string>,
    affected: Set<string>,
  ): Promise<Map<string, string>> {
    const byName = new Map<string, string>();
    for (const m of bundle.monitors) {
      const projectId = projectIdBySlug.get(m.projectSlug);
      if (!projectId) {
        report.warnings.push(`monitor "${m.name}": unknown projectSlug ${m.projectSlug} — skipped`);
        report.monitors.skipped += 1;
        continue;
      }
      const monitorType = this.monitorTypes.get(m.type);
      if (!monitorType) {
        report.warnings.push(`monitor "${m.name}": unknown type ${m.type} — skipped`);
        report.monitors.skipped += 1;
        continue;
      }
      let config: unknown;
      try {
        config = monitorType.configSchema.parse(m.config);
      } catch {
        report.warnings.push(`monitor "${m.name}": invalid ${m.type} config — skipped`);
        report.monitors.skipped += 1;
        continue;
      }
      const data = {
        name: m.name,
        type: m.type,
        config: JSON.stringify(config),
        intervalSeconds: m.intervalSeconds,
        retries: m.retries,
        retryIntervalSeconds: m.retryIntervalSeconds,
        timeoutMs: m.timeoutMs,
        isActive: m.isActive,
      };
      const existing = await tx.monitor.findFirst({ where: { organizationId, projectId, name: m.name } });
      let monitorId: string;
      if (existing) {
        await tx.monitor.update({ where: { id: existing.id }, data });
        report.monitors.updated += 1;
        monitorId = existing.id;
      } else {
        const created = await tx.monitor.create({
          data: { organizationId, projectId, status: 'pending', ...data },
        });
        report.monitors.created += 1;
        monitorId = created.id;
      }
      byName.set(m.name, monitorId);
      affected.add(monitorId);

      const channelIds = [...new Set(m.notifyChannels.map((n) => channelIdByName.get(n)).filter((x): x is string => Boolean(x)))];
      await tx.monitorNotification.deleteMany({ where: { monitorId } });
      for (const channelId of channelIds) {
        await tx.monitorNotification.create({
          data: { monitorId, channelId, notifyOn: 'down,up,repeat', resendEveryMin: null },
        });
      }
    }
    for (const m of await tx.monitor.findMany({ where: { organizationId }, select: { id: true, name: true } })) {
      if (!byName.has(m.name)) byName.set(m.name, m.id);
    }
    return byName;
  }

  private async upsertStatusPages(
    tx: PingWatchPrismaClient,
    organizationId: string,
    bundle: ConfigBundle,
    report: ImportReport,
    monitorIdByName: Map<string, string>,
  ): Promise<void> {
    for (const sp of bundle.statusPages) {
      const data = {
        title: sp.title,
        description: sp.description ?? null,
        themeColor: sp.themeColor ?? null,
        isPublished: sp.isPublished,
      };
      const existing = await tx.statusPage.findFirst({ where: { organizationId, title: sp.title } });
      let pageId: string;
      if (existing) {
        await tx.statusPage.update({ where: { id: existing.id }, data });
        report.statusPages.updated += 1;
        pageId = existing.id;
      } else {
        const created = await tx.statusPage.create({
          data: { organizationId, slug: randomBytes(12).toString('base64url'), ...data },
        });
        report.statusPages.created += 1;
        pageId = created.id;
      }
      const items = [
        ...new Map(
          sp.monitors
            .map((name) => ({ name, id: monitorIdByName.get(name) }))
            .filter((x): x is { name: string; id: string } => Boolean(x.id))
            .map((x) => [x.id, x]),
        ).values(),
      ];
      await tx.statusPageItem.deleteMany({ where: { statusPageId: pageId } });
      let order = 0;
      for (const item of items) {
        await tx.statusPageItem.create({
          data: { statusPageId: pageId, monitorId: item.id, displayName: item.name, sortOrder: order },
        });
        order += 1;
      }
    }
  }

  private async upsertMaintenance(
    tx: PingWatchPrismaClient,
    organizationId: string,
    bundle: ConfigBundle,
    report: ImportReport,
    monitorIdByName: Map<string, string>,
  ): Promise<void> {
    for (const w of bundle.maintenanceWindows) {
      let monitorId: string | null = null;
      if (w.monitor) {
        monitorId = monitorIdByName.get(w.monitor) ?? null;
        if (!monitorId) report.warnings.push(`maintenance "${w.title}": unknown monitor ${w.monitor} — applied org-wide`);
      }
      const data = {
        title: w.title,
        monitorId,
        startsAt: new Date(w.startsAt),
        endsAt: new Date(w.endsAt),
      };
      const existing = await tx.maintenanceWindow.findFirst({ where: { organizationId, title: w.title } });
      if (existing) {
        await tx.maintenanceWindow.update({ where: { id: existing.id }, data });
        report.maintenanceWindows.updated += 1;
      } else {
        await tx.maintenanceWindow.create({ data: { organizationId, ...data } });
        report.maintenanceWindows.created += 1;
      }
    }
  }
}
