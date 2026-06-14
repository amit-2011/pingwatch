import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CheckRunnerService } from './check-runner.service';
import { MonitorRuntime } from './monitor-runtime';
import {
  MONITOR_BEAT_EVENT,
  MONITOR_TRANSITION_EVENT,
  type MonitorBeatEvent,
  type MonitorSpec,
  type MonitorTransitionEvent,
} from './scheduler.types';

const FIRST_BEAT_JITTER_CAP_MS = 5_000;

/**
 * In-process scheduler (PLAN §3.2): each monitor owns a recursive `setTimeout` loop (never
 * `setInterval` — avoids overlap/drift). The first beat is jittered; while a monitor is `pending`
 * it reschedules at the shorter retry interval to confirm faster. Single-instance only.
 *
 * Each (re)start bumps a per-monitor generation token. A tick captures its generation and bails if
 * it changed during the in-flight check — so a restart while a check is running (every monitor edit
 * or pause/resume) can't let a stale tick mutate the fresh runtime or clobber its timer.
 */
@Injectable()
export class SchedulerService implements OnModuleDestroy {
  private readonly runtimes = new Map<string, MonitorRuntime>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly generations = new Map<string, number>();

  constructor(
    private readonly runner: CheckRunnerService,
    private readonly events: EventEmitter2,
  ) {}

  startMonitor(spec: MonitorSpec): void {
    const generation = (this.generations.get(spec.id) ?? 0) + 1;
    this.generations.set(spec.id, generation);
    this.runtimes.set(spec.id, new MonitorRuntime(spec.initialStatus));
    const jitter = Math.random() * Math.min(spec.intervalMs, FIRST_BEAT_JITTER_CAP_MS);
    this.arm(spec, jitter, generation);
  }

  restartMonitor(spec: MonitorSpec): void {
    this.stopMonitor(spec.id);
    this.startMonitor(spec);
  }

  stopMonitor(id: string): void {
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
    this.runtimes.delete(id);
    // Bump the generation so any in-flight tick for this monitor becomes a no-op.
    this.generations.set(id, (this.generations.get(id) ?? 0) + 1);
  }

  activeCount(): number {
    return this.timers.size;
  }

  onModuleDestroy(): void {
    for (const id of [...this.timers.keys()]) this.stopMonitor(id);
  }

  private arm(spec: MonitorSpec, delayMs: number, generation: number): void {
    const timer = setTimeout(() => {
      void this.tick(spec, generation);
    }, delayMs);
    timer.unref();
    this.timers.set(spec.id, timer);
  }

  private async tick(spec: MonitorSpec, generation: number): Promise<void> {
    if (this.generations.get(spec.id) !== generation) return; // superseded before running
    const runtime = this.runtimes.get(spec.id);
    if (!runtime) return;

    const result = await this.runner.run(spec.type, spec.config, spec.timeoutMs);
    if (this.generations.get(spec.id) !== generation) return; // restarted/stopped during the check

    const decision = runtime.applyResult(result.status === 'up', spec.retries);
    const at = Date.now();
    // Confirm faster while pending; otherwise wait the normal interval. This delay is also the
    // duration this beat "covers" for duration-weighted uptime.
    const nextDelay = decision.status === 'pending' ? spec.retryIntervalMs : spec.intervalMs;

    const beat: MonitorBeatEvent = {
      monitorId: spec.id,
      result,
      status: decision.status,
      beatStatus: decision.beatStatus,
      important: decision.important,
      changed: decision.changed,
      failCount: decision.failCount,
      coverageMs: nextDelay,
      at,
    };
    this.events.emit(MONITOR_BEAT_EVENT, beat);

    if (decision.important) {
      const transition: MonitorTransitionEvent = {
        monitorId: spec.id,
        to: decision.status === 'up' ? 'up' : 'down',
        result,
        at,
      };
      this.events.emit(MONITOR_TRANSITION_EVENT, transition);
    }

    this.arm(spec, nextDelay, generation);
  }
}
