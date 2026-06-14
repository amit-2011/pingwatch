import { type CanActivate, type ExecutionContext, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PingWatchPrismaClient } from '@pingwatch/db';
import { PRISMA_CLIENT } from '../common/di-tokens';
import { DomainException } from '../common/domain.exception';

export const ALLOW_DURING_SETUP = 'pingwatch:allowDuringSetup';

/** Mark routes reachable before first-run setup (setup, setup/state, health). */
export const AllowDuringSetup = () => SetMetadata(ALLOW_DURING_SETUP, true);

/**
 * Global gate (PLAN §6.3): until first-run setup is complete, every route except those marked
 * @AllowDuringSetup returns 409 SETUP_REQUIRED. Caches the completed flag (it never reverts).
 */
@Injectable()
export class SetupGuard implements CanActivate {
  private completed = false;

  constructor(
    private readonly reflector: Reflector,
    @Inject(PRISMA_CLIENT) private readonly db: PingWatchPrismaClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const allowed = this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_DURING_SETUP, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowed) return true;
    if (this.completed) return true;

    const state = await this.db.setupState.findUnique({ where: { id: 'singleton' } });
    if (state?.completedAt != null) {
      this.completed = true;
      return true;
    }
    throw new DomainException('SETUP_REQUIRED', 'First-run setup is required', 409);
  }
}
