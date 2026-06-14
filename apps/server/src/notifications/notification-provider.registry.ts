import { Injectable } from '@nestjs/common';
import { builtinProviders } from '@pingwatch/notifications';
import type { NotificationProvider } from '@pingwatch/shared';

/** Holds the available NotificationProvider implementations keyed by id (PLAN §4.2). */
@Injectable()
export class NotificationProviderRegistry {
  private readonly providers = new Map<string, NotificationProvider>();

  constructor() {
    for (const provider of builtinProviders) this.providers.set(provider.id, provider);
  }

  get(id: string): NotificationProvider | undefined {
    return this.providers.get(id);
  }

  list(): NotificationProvider[] {
    return [...this.providers.values()];
  }
}
