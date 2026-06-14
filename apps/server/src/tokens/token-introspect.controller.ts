import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ScopedTokenGuard, type TokenRequest } from '../auth/scoped-token.guard';
import { RequiredScope } from '../auth/scopes.decorator';

/**
 * Programmatic surface authenticated by an API token (P4.6) — NOT a session. Lets a token holder
 * confirm the token works and inspect its scopes, and exercises the ScopedTokenGuard scope gate.
 */
@UseGuards(ScopedTokenGuard)
@Controller('token')
export class TokenIntrospectController {
  /** Any valid token (≥ read) can introspect itself. */
  @RequiredScope('read')
  @Get('whoami')
  whoami(@Req() req: TokenRequest) {
    return {
      organizationId: req.apiTokenOrgId,
      scopes: req.apiTokenScopes ?? [],
      tokenId: req.apiTokenId,
    };
  }

  /** Requires the `admin` scope — used to prove scope enforcement (read-only tokens get 403). */
  @RequiredScope('admin')
  @Get('admin-check')
  adminCheck() {
    return { ok: true };
  }
}
