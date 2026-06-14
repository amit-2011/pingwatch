import { HEARTBEAT_STATUS, type HeartbeatStatus, type MonitorStatus } from '@pingwatch/shared';

export interface ApplyDecision {
  /** New monitor status after this check. */
  status: MonitorStatus;
  /** Numeric status for the Heartbeat row. */
  beatStatus: HeartbeatStatus;
  /** True only on a CONFIRMED transition (DOWN after retries, or recovery from a confirmed down). */
  important: boolean;
  /** Consecutive failure count (0 when up). */
  failCount: number;
  /** Whether the monitor status changed from the previous check. */
  changed: boolean;
}

/**
 * Per-monitor in-memory runtime + the anti-flap confirmation state machine (PLAN §3.5).
 *
 * Rules: never alert on the first failure. A monitor goes DOWN only after `retries + 1` consecutive
 * failures (1 initial + `retries` confirmations) — until then it sits in `pending`. Recovery is
 * `important` ONLY when coming back from a CONFIRMED `down` (a `pending`→`up` flap never alerted, so
 * its recovery is silent). `important` beats are the sole signal handed to the notification layer.
 */
export class MonitorRuntime {
  private status: MonitorStatus;
  private failCount = 0;

  constructor(initialStatus: MonitorStatus = 'pending') {
    this.status = initialStatus;
  }

  getStatus(): MonitorStatus {
    return this.status;
  }

  applyResult(isUp: boolean, retries: number): ApplyDecision {
    const previous = this.status;
    const downThreshold = Math.max(0, retries) + 1;

    if (isUp) {
      this.failCount = 0;
      this.status = 'up';
      return {
        status: 'up',
        beatStatus: HEARTBEAT_STATUS.UP,
        important: previous === 'down', // recovery matters only from a confirmed down
        failCount: 0,
        changed: previous !== 'up',
      };
    }

    this.failCount += 1;
    if (this.failCount >= downThreshold) {
      const wasAlreadyDown = previous === 'down';
      this.status = 'down';
      return {
        status: 'down',
        beatStatus: HEARTBEAT_STATUS.DOWN,
        important: !wasAlreadyDown, // first confirmation → notify
        failCount: this.failCount,
        changed: !wasAlreadyDown,
      };
    }

    this.status = 'pending';
    return {
      status: 'pending',
      beatStatus: HEARTBEAT_STATUS.PENDING,
      important: false,
      failCount: this.failCount,
      changed: previous !== 'pending',
    };
  }
}
