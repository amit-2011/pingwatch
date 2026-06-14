import type { MonitorSpec } from './scheduler.types';

/**
 * The scheduler seam (P4.2). Both backends — the default in-process `SchedulerService` and the
 * opt-in `BullMqSchedulerDriver` — satisfy this exact interface, which is the set of methods
 * `MonitorEngineService` + `SystemController` already call. The engine depends only on this token,
 * so swapping backends is a config decision with no call-site changes.
 */
export interface SchedulerDriver {
  startMonitor(spec: MonitorSpec): void | Promise<void>;
  restartMonitor(spec: MonitorSpec): void | Promise<void>;
  stopMonitor(id: string): void | Promise<void>;
  activeCount(): number | Promise<number>;
  onModuleDestroy(): void | Promise<void>;
}

/** DI token for the active scheduler driver (Symbol convention from common/di-tokens.ts). */
export const SCHEDULER_DRIVER = Symbol('PINGWATCH_SCHEDULER_DRIVER');
