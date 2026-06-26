import { Inject, Injectable } from '@nestjs/common';
import type { CreateChannelInput, NotificationEvent, SendResult, UpdateChannelInput } from '@pingwatch/shared';
import type { PingWatchPrismaClient } from '@pingwatch/db';
import { PRISMA_CLIENT } from '../common/di-tokens';
import { DomainException } from '../common/domain.exception';
import { SecretBoxService } from '../crypto/secret-box.service';
import { DispatchService } from './dispatch.service';
import { NotificationProviderRegistry } from './notification-provider.registry';

/** Public-safe channel view — NEVER returns the (sealed) config / secrets (PLAN §4.6). */
export interface ChannelView {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  isDefault: boolean;
  lastError: string | null;
  lastTestedAt: Date | null;
}

@Injectable()
export class ChannelService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly db: PingWatchPrismaClient,
    private readonly registry: NotificationProviderRegistry,
    private readonly secretBox: SecretBoxService,
    private readonly dispatch: DispatchService,
  ) {}

  async create(organizationId: string, input: CreateChannelInput): Promise<ChannelView> {
    const provider = this.registry.get(input.type);
    if (!provider) {
      throw new DomainException('VALIDATION_ERROR', `Unknown notification provider: ${input.type}`, 400);
    }
    try {
      provider.configSchema.parse(input.config);
    } catch {
      throw new DomainException('VALIDATION_ERROR', `Invalid config for ${input.type}`, 400);
    }
    const channel = await this.db.notificationChannel.create({
      data: {
        organizationId,
        name: input.name,
        type: input.type,
        config: this.secretBox.seal(JSON.stringify(input.config)),
        isActive: input.isActive,
      },
    });
    return this.toView(channel);
  }

  async list(organizationId: string): Promise<ChannelView[]> {
    const channels = await this.db.notificationChannel.findMany({ where: { organizationId } });
    return channels.map((c) => this.toView(c));
  }

  async update(organizationId: string, channelId: string, input: UpdateChannelInput): Promise<ChannelView> {
    const existing = await this.db.notificationChannel.findFirst({ where: { id: channelId, organizationId } });
    if (!existing) throw new DomainException('NOT_FOUND', 'Channel not found', 404);

    const data: { name?: string; type?: string; isActive?: boolean; config?: string } = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.type !== undefined) data.type = input.type;

    // The sealed config is never returned, so it is only touched when the caller sends a new one.
    if (input.config !== undefined) {
      const nextType = input.type ?? existing.type;
      const provider = this.registry.get(nextType);
      if (!provider) {
        throw new DomainException('VALIDATION_ERROR', `Unknown notification provider: ${nextType}`, 400);
      }
      try {
        provider.configSchema.parse(input.config);
      } catch {
        throw new DomainException('VALIDATION_ERROR', `Invalid config for ${nextType}`, 400);
      }
      data.config = this.secretBox.seal(JSON.stringify(input.config));
    } else if (input.type !== undefined && input.type !== existing.type) {
      // Switching provider type without new credentials would leave a config that no longer matches.
      throw new DomainException('VALIDATION_ERROR', 'A new config is required when changing the channel type', 400);
    }

    const channel = await this.db.notificationChannel.update({ where: { id: channelId }, data });
    return this.toView(channel);
  }

  async test(organizationId: string, channelId: string): Promise<SendResult> {
    const channel = await this.db.notificationChannel.findFirst({
      where: { id: channelId, organizationId },
    });
    if (!channel) throw new DomainException('NOT_FOUND', 'Channel not found', 404);

    const event: NotificationEvent = {
      type: 'test',
      organizationId,
      monitor: { id: 'test', name: 'Test Monitor', type: 'http' },
      status: 'up',
      message: 'Test alert from PingWatch',
      occurredAt: new Date().toISOString(),
    };
    return this.dispatch.deliver(channel, event);
  }

  private toView(c: {
    id: string;
    name: string;
    type: string;
    isActive: boolean;
    isDefault: boolean;
    lastError: string | null;
    lastTestedAt: Date | null;
  }): ChannelView {
    return {
      id: c.id,
      name: c.name,
      type: c.type,
      isActive: c.isActive,
      isDefault: c.isDefault,
      lastError: c.lastError,
      lastTestedAt: c.lastTestedAt,
    };
  }
}
