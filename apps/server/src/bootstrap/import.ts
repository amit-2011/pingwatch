/**
 * `pingwatch import` / `export` CLI bootstrap (P4.6). Mirrors runMigrate — resolve config, ensure
 * the secret + DB — then constructs the config-io services MANUALLY (no NestFactory) so a one-shot
 * command never starts the HTTP server, scheduler, or background listeners. Exits cleanly.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deployMigrations, type PingWatchPrismaClient } from '@pingwatch/db';
import { resolveConfig, type CliFlags } from '../config/resolve';
import { ensureDataDir } from './paths';
import { ensureSecret } from './secret';
import { initDatabase } from './database';
import { SecretBoxService } from '../crypto/secret-box.service';
import { MonitorTypeRegistry } from '../engine/monitor-type.registry';
import { NotificationProviderRegistry } from '../notifications/notification-provider.registry';
import { ConfigExportService } from '../config-io/config-export.service';
import { ConfigImportService } from '../config-io/config-import.service';
import { fromYaml, toYaml } from '../config-io/config-yaml';

export interface ConfigCliFlags extends CliFlags {
  org?: string;
  dryRun?: boolean;
}

async function resolveOrgId(db: PingWatchPrismaClient, orgSlug?: string): Promise<string> {
  if (orgSlug) {
    const org = await db.organization.findUnique({ where: { slug: orgSlug }, select: { id: true } });
    if (!org) throw new Error(`Organization not found: ${orgSlug}`);
    return org.id;
  }
  const orgs = await db.organization.findMany({ select: { id: true, slug: true }, orderBy: { createdAt: 'asc' } });
  const first = orgs[0];
  if (!first) throw new Error('No organizations exist yet — run the server once and complete setup first.');
  if (orgs.length > 1) {
    throw new Error(`Multiple organizations exist; pass --org <slug> (one of: ${orgs.map((o) => o.slug).join(', ')})`);
  }
  return first.id;
}

export async function runImport(file: string, flags: ConfigCliFlags): Promise<void> {
  const config = resolveConfig(flags);
  ensureDataDir(config.dataDir);
  const secret = ensureSecret(config.dataDir);
  deployMigrations(config.databaseUrl);
  const db = await initDatabase(config.databaseUrl);
  try {
    const orgId = await resolveOrgId(db, flags.org);
    const importer = new ConfigImportService(
      db,
      new SecretBoxService(secret),
      new MonitorTypeRegistry(),
      new NotificationProviderRegistry(),
    );
    const { report } = await importer.import(orgId, fromYaml(readFileSync(file, 'utf8')), flags.dryRun ?? false);
    console.log(`[pingwatch] import ${flags.dryRun ? '(dry run) ' : ''}complete:`);
    console.log(`  projects:    +${report.projects.created} ~${report.projects.updated}`);
    console.log(`  channels:    +${report.channels.created} ~${report.channels.updated} (skipped ${report.channels.skipped})`);
    console.log(`  monitors:    +${report.monitors.created} ~${report.monitors.updated}`);
    console.log(`  status pages:+${report.statusPages.created} ~${report.statusPages.updated}`);
    console.log(`  maintenance: +${report.maintenanceWindows.created} ~${report.maintenanceWindows.updated}`);
    for (const w of report.warnings) console.log(`  ! ${w}`);
  } finally {
    await db.$disconnect();
  }
}

export async function runExport(file: string, flags: ConfigCliFlags): Promise<void> {
  const config = resolveConfig(flags);
  ensureDataDir(config.dataDir);
  ensureSecret(config.dataDir);
  deployMigrations(config.databaseUrl);
  const db = await initDatabase(config.databaseUrl);
  try {
    const orgId = await resolveOrgId(db, flags.org);
    const yaml = toYaml(await new ConfigExportService(db).export(orgId));
    writeFileSync(file, yaml);
    console.log(`[pingwatch] exported config → ${file}`);
  } finally {
    await db.$disconnect();
  }
}
