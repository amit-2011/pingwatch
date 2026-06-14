import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { DomainException } from '../common/domain.exception';
import type { AuthenticatedUser, RequestWithUser } from './authenticated-user';

/** Inject the authenticated principal (set by JwtAuthGuard) into a handler param. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx.switchToHttp().getRequest<RequestWithUser>();
    if (!req.user) {
      throw new DomainException('UNAUTHORIZED', 'Not authenticated', 401);
    }
    return req.user;
  },
);
