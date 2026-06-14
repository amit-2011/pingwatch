import { Inject, Injectable } from '@nestjs/common';
import type { CheckResult } from '@pingwatch/shared';
import { PINGWATCH_CONFIG } from '../common/di-tokens';
import type { ResolvedConfig } from '../config/schema';
import { type Limiter, createLimiter } from './concurrency';
import { MonitorTypeRegistry } from './monitor-type.registry';

/**
 * Executes a single monitor check under a global concurrency cap + a hard per-check timeout
 * (PLAN §3.4). Always resolves to a CheckResult — a hung target or bad config becomes `down`,
 * never an unhandled rejection that could stall the scheduler.
 */
@Injectable()
export class CheckRunnerService {
  private readonly limit: Limiter;

  constructor(
    @Inject(PINGWATCH_CONFIG) config: ResolvedConfig,
    private readonly registry: MonitorTypeRegistry,
  ) {
    this.limit = createLimiter(config.maxConcurrency);
  }

  /** Number of checks currently executing (self-observability — exposed via /api/system). */
  inFlight(): number {
    return this.limit.inFlight();
  }

  run(type: string, rawConfig: unknown, timeoutMs: number): Promise<CheckResult> {
    const monitorType = this.registry.get(type);
    if (!monitorType) {
      return Promise.resolve({ status: 'down', responseTimeMs: 0, message: `Unknown monitor type: ${type}` });
    }
    return this.limit(async () => {
      const start = performance.now();
      try {
        const config = monitorType.validateConfig(rawConfig);
        return await monitorType.check({
          config,
          signal: AbortSignal.timeout(timeoutMs),
          now: () => performance.now(),
        });
      } catch (err) {
        return {
          status: 'down' as const,
          responseTimeMs: Math.round(performance.now() - start),
          message: err instanceof Error ? err.message : 'Check failed',
        };
      }
    });
  }
}
