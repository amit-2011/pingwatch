import type { CheckResult, HeartbeatStatus, MonitorStatus } from '@pingwatch/shared';

/** Everything the scheduler needs to run one monitor (loaded from the DB by the engine). */
export interface MonitorSpec {
  id: string;
  type: string;
  config: unknown;
  intervalMs: number;
  retries: number;
  retryIntervalMs: number;
  timeoutMs: number;
  /** Status to rehydrate into on (re)start — restored from the last confirmed beat in T11. */
  initialStatus: MonitorStatus;
}

export const MONITOR_BEAT_EVENT = 'monitor.beat';
export const MONITOR_TRANSITION_EVENT = 'monitor.transition';

/** Emitted on every check. The heartbeat writer (T10) persists these. */
export interface MonitorBeatEvent {
  monitorId: string;
  result: CheckResult;
  status: MonitorStatus;
  beatStatus: HeartbeatStatus;
  important: boolean;
  failCount: number;
  at: number;
}

/** Emitted only on a CONFIRMED transition. The incident/notification layer (T12) consumes these. */
export interface MonitorTransitionEvent {
  monitorId: string;
  to: 'up' | 'down';
  result: CheckResult;
  at: number;
}
