import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type UserRole, roleMeets } from '@pingwatch/shared';
import { DomainException } from '../common/domain.exception';
import type { RequestWithUser } from './authenticated-user';
import { ROLES_KEY } from './roles.decorator';

/** Enforces @Roles(...). Runs AFTER JwtAuthGuard (needs req.user). MVP exercises admin-only. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    if (!user) throw new DomainException('UNAUTHORIZED', 'Not authenticated', 401);
    if (!required.some((role) => roleMeets(user.role, role))) {
      throw new DomainException('FORBIDDEN', 'Insufficient permissions', 403);
    }
    return true;
  }
}
