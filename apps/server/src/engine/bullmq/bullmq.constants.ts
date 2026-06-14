/** Shared keys + names for the BullMQ scheduler (P4.2). One queue; per-monitor scheduler + state. */

export const REDIS_CONNECTION = Symbol('PINGWATCH_REDIS_CONNECTION');

export const CHECK_QUEUE = 'pingwatch-checks'; // BullMQ forbids ':' in queue names
export const CHECK_JOB = 'check';

/** Stable per-monitor job-scheduler id → BullMQ guarantees one due job per interval cluster-wide. */
export const jobSchedulerId = (monitorId: string): string => `monitor:${monitorId}`;

/** The monitor's current spec (JSON), re-read by the worker so config edits apply immediately. */
export const specKey = (monitorId: string): string => `pingwatch:spec:${monitorId}`;

/** Centralized anti-flap state hash: { status, failCount }. */
export const runtimeKey = (monitorId: string): string => `pingwatch:runtime:${monitorId}`;

/** Per-monitor mutex so two instances can't double-advance the anti-flap state machine. */
export const lockKey = (monitorId: string): string => `pingwatch:lock:${monitorId}`;

export const LEADER_KEY = 'pingwatch:leader';

export const LOCK_TTL_MS = 5_000;
export const LEADER_TTL_MS = 10_000;
export const LEADER_RENEW_MS = 3_000;
