import { HEARTBEAT_STATUS, type HeartbeatStatus } from '@pingwatch/shared';
import { DAY_MS } from './time-buckets';

interface RingBeat {
  at: number;
  up: boolean;
  down: boolean;
  coverageMs: number;
}

/**
 * In-memory 24h ring (PLAN §3.7). Stores per-beat coverage so 24h uptime is duration-weighted —
 * the same math as the rollups — instead of a misleading raw row-count. `pending`/`maintenance`
 * beats are excluded from the up/down denominator.
 */
export class UptimeRing {
  private beats: RingBeat[] = [];

  push(at: number, beatStatus: HeartbeatStatus, coverageMs: number): void {
    this.beats.push({
      at,
      up: beatStatus === HEARTBEAT_STATUS.UP,
      down: beatStatus === HEARTBEAT_STATUS.DOWN,
      coverageMs,
    });
    this.evict(at);
  }

  /** Backfill from historical beats on boot (rehydration, T11). */
  seed(history: ReadonlyArray<{ at: number; beatStatus: HeartbeatStatus; coverageMs: number }>): void {
    for (const b of history) this.push(b.at, b.beatStatus, b.coverageMs);
  }

  private evict(now: number): void {
    const cutoff = now - DAY_MS;
    while (this.beats.length > 0 && this.beats[0]!.at < cutoff) this.beats.shift();
  }

  /** Duration-weighted uptime % over the last 24h, or null if no up/down coverage yet. */
  uptimePct(now: number): number | null {
    this.evict(now);
    let upMs = 0;
    let totalMs = 0;
    for (const b of this.beats) {
      if (b.up) {
        upMs += b.coverageMs;
        totalMs += b.coverageMs;
      } else if (b.down) {
        totalMs += b.coverageMs;
      }
    }
    return totalMs > 0 ? (upMs / totalMs) * 100 : null;
  }
}
