/**
 * Scoped, rotatable API token DTOs (P4.6). Tokens are opaque `pwt_…` secrets stored as sha256 and
 * shown ONCE at create/rotate time; the views never carry the raw token (except the dedicated
 * one-time secret view). Rotation mirrors the refresh-token family + reuse-detection model.
 */
import { z } from 'zod';
import { TOKEN_SCOPES } from './constants';

export const createApiTokenSchema = z.object({
  name: z.string().min(1).max(120),
  scopes: z.array(z.enum(TOKEN_SCOPES)).min(1),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});
export type CreateApiTokenInput = z.infer<typeof createApiTokenSchema>;

/** Safe view — never includes the raw secret. */
export interface ApiTokenView {
  id: string;
  name: string;
  type: string;
  scopes: string[];
  prefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  /** True if this token was superseded by a rotation. */
  rotated: boolean;
  createdAt: string;
}

/** Returned ONCE on create/rotate — carries the raw token the caller must save now. */
export interface ApiTokenSecretView extends ApiTokenView {
  token: string;
}
