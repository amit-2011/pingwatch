/**
 * Shared union constants — the single source of truth for the string enums used across the
 * DB (stored as String columns, never DB enums — see PLAN §2.1), the API, and the UI.
 * Deriving the TS types from `as const` arrays keeps the values and types in lockstep.
 */

export const MONITOR_TYPES = ['http', 'tcp', 'ping', 'dns', 'ssl', 'keyword', 'system'] as const;
/** The monitor-type discriminator (the plugin interface is `MonitorType` in ./plugins). MVP ships `http` only. */
export type MonitorTypeId = (typeof MONITOR_TYPES)[number];

export const MONITOR_STATUS = ['up', 'down', 'pending', 'paused', 'maintenance'] as const;
export type MonitorStatus = (typeof MONITOR_STATUS)[number];

/** Compact numeric status stored on each Heartbeat row (PLAN §2.1). */
export const HEARTBEAT_STATUS = { DOWN: 0, UP: 1, PENDING: 2, MAINTENANCE: 3 } as const;
export type HeartbeatStatusName = keyof typeof HEARTBEAT_STATUS;
export type HeartbeatStatus = (typeof HEARTBEAT_STATUS)[HeartbeatStatusName]; // 0 | 1 | 2 | 3

export const USER_ROLES = ['admin', 'member', 'viewer'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Higher rank ⇒ more privilege. Use `roleMeets` rather than comparing ranks directly. */
export const ROLE_RANK = { viewer: 0, member: 1, admin: 2 } as const satisfies Record<UserRole, number>;

export const CHANNEL_TYPES = [
  'telegram',
  'slack',
  'email',
  'discord',
  'webhook',
  'msteams',
  'pushover',
  'gotify',
  'twilio',
  'whatsapp',
] as const;
/** Notification channel/provider id — the single source of truth for the provider plugin ids. */
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const TOKEN_TYPES = ['agent', 'api'] as const;
export type TokenType = (typeof TOKEN_TYPES)[number];

export const INCIDENT_STATUS = ['open', 'acknowledged', 'resolved'] as const;
export type IncidentStatus = (typeof INCIDENT_STATUS)[number];

export const INCIDENT_SEVERITY = ['minor', 'major', 'critical'] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITY)[number];

/** Upper bound on steps in one escalation chain (P4.3). */
export const MAX_ESCALATION_STEPS = 10;

export const NOTIFY_EVENT_TYPES = ['down', 'up', 'repeat', 'test', 'cert-expiry', 'threshold'] as const;
export type NotifyEventType = (typeof NOTIFY_EVENT_TYPES)[number];

/** Does role `have` meet or exceed `required`? (RBAC helper — PLAN §6.4) */
export function roleMeets(have: UserRole, required: UserRole): boolean {
  return ROLE_RANK[have] >= ROLE_RANK[required];
}

/**
 * Canonical mapping between the lowercase `MonitorStatus` strings and the compact numeric
 * `HEARTBEAT_STATUS` written to `Heartbeat.status` (Int). Lives here so the engine write path
 * (T10), boot rehydration (T11), and the frontend HeartbeatBar (T16) never re-derive it.
 * Note the asymmetry: `paused` has NO heartbeat int (paused monitors don't emit heartbeats).
 */
export function monitorStatusToHeartbeat(status: MonitorStatus): HeartbeatStatus | null {
  switch (status) {
    case 'up':
      return HEARTBEAT_STATUS.UP;
    case 'down':
      return HEARTBEAT_STATUS.DOWN;
    case 'pending':
      return HEARTBEAT_STATUS.PENDING;
    case 'maintenance':
      return HEARTBEAT_STATUS.MAINTENANCE;
    case 'paused':
      return null;
  }
}

export function heartbeatToMonitorStatus(status: HeartbeatStatus): MonitorStatus {
  switch (status) {
    case HEARTBEAT_STATUS.UP:
      return 'up';
    case HEARTBEAT_STATUS.DOWN:
      return 'down';
    case HEARTBEAT_STATUS.PENDING:
      return 'pending';
    case HEARTBEAT_STATUS.MAINTENANCE:
      return 'maintenance';
  }
}
