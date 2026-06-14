import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

export interface GeneratedToken {
  /** The raw secret — shown to the client ONCE, never stored. */
  raw: string;
  /** sha256(raw) — what we persist (refresh tokens, API tokens). */
  hash: string;
  /** First 8 chars of raw, for non-sensitive UI display. */
  prefix: string;
}

/** Opaque token primitives (PLAN §6.2): refresh tokens + API/agent tokens are stored as sha256. */
@Injectable()
export class TokenService {
  generate(): GeneratedToken {
    const raw = randomBytes(32).toString('base64url');
    return { raw, hash: this.hash(raw), prefix: raw.slice(0, 8) };
  }

  hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
