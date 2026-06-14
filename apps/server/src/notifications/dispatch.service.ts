import { Inject, Injectable, Logger } from '@nestjs/common';
import { renderNotification } from '@pingwatch/notifications';
import type { NotificationEvent, NotifyEventType, SendResult } from '@pingwatch/shared';
import type { PingWatchPrismaClient } from '@pingwatch/db';
import { PRISMA_CLIENT } from '../common/di-tokens';
import { SecretBoxService } from '../crypto/secret-box.service';
import { createLimiter, type Limiter } from '../engine/concurrency';
import { NotificationProviderRegistry } from './notification-provider.registry';

interface ChannelRow {
  id: string;
  type: string;
  config: string;
}

const RETRY_BACKOFF_MS = [1_000, 4_000];

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Delivers notifications (PLAN §4.4): per-channel concurrency cap, retry on `transient` errors
 * only, outcome persisted to `channel.lastError`. A failed delivery never blocks the incident
 * state machine (the caller awaits but ignores failures).
 */
@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);
  private readonly limit: Limiter = createLimiter(5);

  constructor(
    @Inject(PRISMA_CLIENT) private readonly db: PingWatchPrismaClient,
    private readonly registry: NotificationProviderRegistry,
    private readonly secretBox: SecretBoxService,
  ) {}

  /** Dispatch to every channel linked to the monitor whose notifyOn includes this event type. */
  async dispatchToMonitor(monitorId: string, eventType: NotifyEventType, event: NotificationEvent): Promise<void> {
    const links = await this.db.monitorNotification.findMany({
      where: { monitorId },
      include: { channel: true },
    });
    const targets = links
      .filter((l) => l.channel.isActive && l.notifyOn.split(',').includes(eventType))
      .map((l) => l.channel);

    await Promise.all(targets.map((channel) => this.limit(() => this.deliver(channel, event))));
  }

  /** Deliver one notification to one channel, with transient retry. Outcome persisted. */
  async deliver(channel: ChannelRow, event: NotificationEvent): Promise<SendResult> {
    const provider = this.registry.get(channel.type);
    if (!provider) {
      return this.record(channel.id, { ok: false, errorKind: 'permanent', message: `Unknown provider: ${channel.type}` }, event);
    }

    let config: unknown;
    try {
      config = provider.configSchema.parse(JSON.parse(this.secretBox.open(channel.config)));
    } catch (err) {
      return this.record(channel.id, { ok: false, errorKind: 'permanent', message: `Invalid channel config: ${err instanceof Error ? err.message : 'parse error'}` }, event);
    }

    const rendered = renderNotification(event);
    const result = await this.withRetry(() => provider.send({ config, event, rendered }));
    return this.record(channel.id, result, event);
  }

  private async withRetry(send: () => Promise<SendResult>): Promise<SendResult> {
    let last: SendResult = { ok: false, errorKind: 'transient', message: 'not attempted' };
    for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt += 1) {
      last = await send();
      if (last.ok || last.errorKind !== 'transient') return last;
      const backoff = RETRY_BACKOFF_MS[attempt];
      if (backoff !== undefined) await sleep(backoff);
    }
    return last;
  }

  private async record(channelId: string, result: SendResult, event: NotificationEvent): Promise<SendResult> {
    if (!result.ok) {
      this.logger.warn(`Notification to channel ${channelId} failed: ${result.message ?? 'unknown'}`);
    }
    await this.db.notificationChannel.update({
      where: { id: channelId },
      data: {
        lastError: result.ok ? null : (result.message ?? 'Delivery failed'),
        ...(event.type === 'test' ? { lastTestedAt: new Date() } : {}),
      },
    });
    return result;
  }
}
