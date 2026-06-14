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
 */
@Injectable()
export class SchedulerService implements OnModuleDestroy {
  private readonly runtimes = new Map<string, MonitorRuntime>();
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly runner: CheckRunnerService,
    private readonly events: EventEmitter2,
  ) {}

  startMonitor(spec: MonitorSpec): void {
    this.runtimes.set(spec.id, new MonitorRuntime(spec.initialStatus));
    const jitter = Math.random() * Math.min(spec.intervalMs, FIRST_BEAT_JITTER_CAP_MS);
    this.arm(spec, jitter);
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
  }

  activeCount(): number {
    return this.timers.size;
  }

  onModuleDestroy(): void {
    for (const id of [...this.timers.keys()]) this.stopMonitor(id);
  }

  private arm(spec: MonitorSpec, delayMs: number): void {
    const timer = setTimeout(() => {
      void this.tick(spec);
    }, delayMs);
    timer.unref();
    this.timers.set(spec.id, timer);
  }

  private async tick(spec: MonitorSpec): Promise<void> {
    const runtime = this.runtimes.get(spec.id);
    if (!runtime) return; // stopped mid-flight

    const result = await this.runner.run(spec.type, spec.config, spec.timeoutMs);
    if (!this.runtimes.has(spec.id)) return; // stopped while the check was running

    const decision = runtime.applyResult(result.status === 'up', spec.retries);
    const at = Date.now();

    const beat: MonitorBeatEvent = {
      monitorId: spec.id,
      result,
      status: decision.status,
      beatStatus: decision.beatStatus,
      important: decision.important,
      failCount: decision.failCount,
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

    // Confirm faster while pending; otherwise wait the normal interval.
    const nextDelay = decision.status === 'pending' ? spec.retryIntervalMs : spec.intervalMs;
    this.arm(spec, nextDelay);
  }
}
