import type { Request } from 'express';
import ipaddr from 'ipaddr.js';
import type { ExternalIdentity } from '@pingwatch/shared';

/** A pluggable external auth source (P4.5). Only the trusted-header frontend resolves per-request. */
export interface AuthFrontend {
  readonly mode: 'trusted-header' | 'oidc';
  tryResolve(req: Request): Promise<ExternalIdentity | null>;
}

export const AUTH_FRONTEND = Symbol('PINGWATCH_AUTH_FRONTEND');

/**
 * True iff the request's IMMEDIATE peer (the connecting socket, i.e. the reverse proxy) is within
 * one of the trusted CIDRs. This is THE security boundary for header auth: X-Forwarded-* headers
 * are only honored when the proxy itself is trusted, so a direct client can't spoof them.
 */
export function isTrustedProxy(peerAddress: string | undefined, cidrs: string[]): boolean {
  if (!peerAddress || cidrs.length === 0) return false;
  let addr: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    addr = ipaddr.process(peerAddress); // unwraps IPv4-mapped IPv6 (::ffff:127.0.0.1 → 127.0.0.1)
  } catch {
    return false;
  }
  for (const cidr of cidrs) {
    try {
      const range = ipaddr.parseCIDR(cidr);
      if (addr.kind() === range[0].kind() && addr.match(range)) return true;
    } catch {
      // skip malformed CIDR
    }
  }
  return false;
}
