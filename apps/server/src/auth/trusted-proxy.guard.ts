import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { PINGWATCH_CONFIG } from '../common/di-tokens';
import type { ResolvedConfig } from '../config/schema';
import { DomainException } from '../common/domain.exception';
import { isTrustedProxy } from './frontends/auth-frontend';

/** Rejects any request whose immediate peer is not a configured trusted proxy (P4.5). */
@Injectable()
export class TrustedProxyGuard implements CanActivate {
  constructor(@Inject(PINGWATCH_CONFIG) private readonly config: ResolvedConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (!isTrustedProxy(req.socket.remoteAddress, this.config.auth.trustedProxyCidrs)) {
      throw new DomainException('UNAUTHORIZED', 'Request did not originate from a trusted proxy', 401);
    }
    return true;
  }
}
