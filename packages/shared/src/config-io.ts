/**
 * Canonical YAML config bundle (P4.6) — an org's projects, monitors, channels, status pages and
 * maintenance windows as version-controllable config-as-code. Export redacts channel secrets by
 * default; import upserts idempotently by stable keys (slug / name / title), never by internal id.
 */
import { z } from 'zod';
import { CHANNEL_TYPES } from './constants';

export const CONFIG_BUNDLE_VERSION = 1;

/**
 * How a channel's secret travels in the bundle. `redacted` (the export default) carries NO secret —
 * on import it keeps an existing channel's sealed config and cannot create a new channel. `plaintext`
 * carries the secret in the clear (the operator fills it in) and is sealed on import.
 */
export const channelSecretSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('redacted') }),
  z.object({ mode: z.literal('plaintext'), config: z.record(z.unknown()) }),
]);
export type ChannelSecret = z.infer<typeof channelSecretSchema>;

export const configProjectSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120),
});

export const configChannelSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(CHANNEL_TYPES),
  isActive: z.boolean().default(true),
  secret: channelSecretSchema.default({ mode: 'redacted' }),
});

export const configMonitorSchema = z.object({
  projectSlug: z.string().min(1),
  name: z.string().min(1).max(120),
  type: z.string().min(1),
  config: z.record(z.unknown()).default({}),
  intervalSeconds: z.number().int().min(20).max(86_400).default(60),
  retries: z.number().int().min(0).max(10).default(3),
  retryIntervalSeconds: z.number().int().min(5).max(3_600).default(30),
  timeoutMs: z.number().int().min(1_000).max(120_000).default(30_000),
  isActive: z.boolean().default(true),
  /** Channel names to notify (resolved to ids on import). */
  notifyChannels: z.array(z.string()).default([]),
});

export const configStatusPageSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().nullish(),
  themeColor: z.string().nullish(),
  isPublished: z.boolean().default(true),
  /** Monitor names shown on the page (resolved to ids on import). */
  monitors: z.array(z.string()).default([]),
});

export const configMaintenanceSchema = z.object({
  title: z.string().min(1).max(120),
  /** Monitor name, or null for the whole org. */
  monitor: z.string().nullable().default(null),
  startsAt: z.string(),
  endsAt: z.string(),
});

export const configBundleSchema = z.object({
  version: z.literal(CONFIG_BUNDLE_VERSION),
  exportedAt: z.string().optional(),
  org: z.object({ name: z.string(), slug: z.string() }).optional(),
  projects: z.array(configProjectSchema).default([]),
  channels: z.array(configChannelSchema).default([]),
  monitors: z.array(configMonitorSchema).default([]),
  statusPages: z.array(configStatusPageSchema).default([]),
  maintenanceWindows: z.array(configMaintenanceSchema).default([]),
});
export type ConfigBundle = z.infer<typeof configBundleSchema>;

export const importConfigSchema = z.object({
  yaml: z.string().min(1),
  dryRun: z.boolean().default(false),
});
export type ImportConfigInput = z.infer<typeof importConfigSchema>;

interface ResourceCounts {
  created: number;
  updated: number;
  skipped: number;
}

export interface ImportReport {
  dryRun: boolean;
  projects: ResourceCounts;
  channels: ResourceCounts;
  monitors: ResourceCounts;
  statusPages: ResourceCounts;
  maintenanceWindows: ResourceCounts;
  warnings: string[];
}
