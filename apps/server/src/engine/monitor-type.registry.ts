import { Injectable } from '@nestjs/common';
import { builtinMonitorTypes } from '@pingwatch/monitor-core';
import type { MonitorType } from '@pingwatch/shared';

/** Holds the available MonitorType implementations keyed by id (PLAN §3.1). */
@Injectable()
export class MonitorTypeRegistry {
  private readonly types = new Map<string, MonitorType>();

  constructor() {
    for (const monitorType of builtinMonitorTypes) {
      this.register(monitorType);
    }
  }

  register(monitorType: MonitorType): void {
    this.types.set(monitorType.type, monitorType);
  }

  get(type: string): MonitorType | undefined {
    return this.types.get(type);
  }

  has(type: string): boolean {
    return this.types.has(type);
  }

  list(): string[] {
    return [...this.types.keys()];
  }
}
