import { Inject, Injectable } from '@nestjs/common';
import { type JWTPayload, createRemoteJWKSet, jwtVerify } from 'jose';
import type { ExternalIdentity } from '@pingwatch/shared';
import { PINGWATCH_CONFIG } from '../../common/di-tokens';
import type { ResolvedConfig } from '../../config/schema';
import { DomainException } from '../../common/domain.exception';

interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

/**
 * OIDC authorization-code + PKCE login (P4.5). Discovers the issuer, builds the authorize redirect,
 * exchanges the code, and validates the id_token signature/iss/aud/exp/nonce against the remote
 * JWKS via `jose`. Email + groups are read from the configured claims. Lazily discovered + cached.
 */
@Injectable()
export class OidcStrategy {
  private discovery?: Discovery;
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(@Inject(PINGWATCH_CONFIG) private readonly config: ResolvedConfig) {}

  private get auth() {
    return this.config.auth;
  }

  private async discover(): Promise<Discovery> {
    if (this.discovery) return this.discovery;
    const url = `${this.auth.oidcIssuer?.replace(/\/$/, '')}/.well-known/openid-configuration`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new DomainException('INTERNAL', `OIDC discovery failed: HTTP ${res.status}`, 500);
    const d = (await res.json()) as Discovery;
    this.discovery = d;
    this.jwks = createRemoteJWKSet(new URL(d.jwks_uri));
    return d;
  }

  async authorizationUrl(state: string, nonce: string, codeChallenge: string): Promise<string> {
    const d = await this.discover();
    const u = new URL(d.authorization_endpoint);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('client_id', this.auth.oidcClientId ?? '');
    u.searchParams.set('redirect_uri', this.auth.oidcRedirectUri ?? '');
    u.searchParams.set('scope', 'openid email profile');
    u.searchParams.set('state', state);
    u.searchParams.set('nonce', nonce);
    u.searchParams.set('code_challenge', codeChallenge);
    u.searchParams.set('code_challenge_method', 'S256');
    return u.toString();
  }

  async exchangeAndVerify(code: string, codeVerifier: string, nonce: string): Promise<ExternalIdentity> {
    const d = await this.discover();
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.auth.oidcRedirectUri ?? '',
      client_id: this.auth.oidcClientId ?? '',
      code_verifier: codeVerifier,
    });
    if (this.auth.oidcClientSecret) body.set('client_secret', this.auth.oidcClientSecret);

    const res = await fetch(d.token_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new DomainException('UNAUTHORIZED', `OIDC token exchange failed: HTTP ${res.status}`, 401);
    const tokens = (await res.json()) as { id_token?: string };
    if (!tokens.id_token || !this.jwks) {
      throw new DomainException('UNAUTHORIZED', 'OIDC response missing id_token', 401);
    }

    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(tokens.id_token, this.jwks, {
        issuer: d.issuer,
        audience: this.auth.oidcClientId ?? '',
      }));
    } catch {
      throw new DomainException('UNAUTHORIZED', 'OIDC id_token validation failed', 401);
    }
    if (payload.nonce !== nonce) throw new DomainException('UNAUTHORIZED', 'OIDC nonce mismatch', 401);

    // The email is the account key, so it MUST be verified by the IdP — otherwise an IdP that lets a
    // user self-assert any address would allow takeover of an existing PingWatch account by email.
    if (payload.email_verified !== true) {
      throw new DomainException('UNAUTHORIZED', 'OIDC email is not verified by the identity provider', 401);
    }
    const email = payload[this.auth.oidcEmailClaim];
    if (typeof email !== 'string') throw new DomainException('UNAUTHORIZED', 'OIDC id_token missing email claim', 401);
    const groupsClaim = payload[this.auth.oidcGroupsClaim];
    const groups = Array.isArray(groupsClaim) ? groupsClaim.filter((g): g is string => typeof g === 'string') : [];

    return {
      subject: typeof payload.sub === 'string' ? payload.sub : email,
      email,
      groups,
      source: 'oidc',
      ...(typeof payload.name === 'string' ? { name: payload.name } : {}),
    };
  }
}
