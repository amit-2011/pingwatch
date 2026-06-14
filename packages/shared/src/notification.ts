/**
 * Notification channel config schemas + the `NotificationEvent` carried from the engine to a
 * provider (PLAN §4). MVP ships Telegram only; each new provider adds a config schema here and
 * an implementation in @pingwatch/notifications.
 *
 * Secret fields (e.g. Telegram `botToken`) are SecretBox-sealed at rest (PLAN §6.7); the schema
 * only describes the plaintext shape the provider receives.
 */
import { z } from 'zod';
import { CHANNEL_TYPES, type MonitorStatus, type MonitorTypeId, type NotifyEventType } from './constants';

export const telegramChannelConfigSchema = z.object({
  botToken: z.string().min(1),
  chatId: z.string().min(1),
});
export type TelegramChannelConfig = z.infer<typeof telegramChannelConfigSchema>;

/**
 * Generic create-channel DTO. `config` is provider-specific and is re-validated by the chosen
 * provider's own `configSchema` (see `NotificationProvider` in ./plugins) — this outer schema
 * only guarantees it is a JSON object.
 */
export const createChannelSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(CHANNEL_TYPES),
  config: z.record(z.unknown()),
  isActive: z.boolean().default(true),
});
export type CreateChannelInput = z.infer<typeof createChannelSchema>;

/** The monitor identity embedded in a notification (only public-safe fields). */
export interface NotificationEventMonitor {
  id: string;
  name: string;
  type: MonitorTypeId;
  /** Type-neutral human-readable target (url for http, host:port for tcp, hostname for dns…). */
  target?: string | undefined;
}

/**
 * Emitted by the engine on a CONFIRMED transition (post-anti-flap) and handed to providers.
 * `occurredAt` is an ISO-8601 string so the contract is JSON-serialisable across the wire.
 * Optionals admit `undefined` explicitly so the engine can build events from computed values
 * under `exactOptionalPropertyTypes`.
 */
export interface NotificationEvent {
  type: NotifyEventType;
  organizationId: string;
  monitor: NotificationEventMonitor;
  status: MonitorStatus;
  previousStatus?: MonitorStatus | undefined;
  message: string;
  occurredAt: string;
  incidentId?: string | undefined;
}
