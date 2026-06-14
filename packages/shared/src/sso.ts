/**
 * SSO + secret-backend contract (P4.5). All OPT-IN: the defaults are local password auth + a
 * file-based secret, so an install with no new env behaves exactly as before.
 */
import { z } from 'zod';

export const SSO_MODES = ['local', 'trusted-header', 'oidc'] as const;
export type SsoMode = (typeof SSO_MODES)[number];

export const SECRET_BACKENDS = ['file', 'env', 'kms'] as const;
export type SecretBackendKind = (typeof SECRET_BACKENDS)[number];

/** An identity resolved by an external auth frontend (reverse-proxy header or OIDC). */
export const externalIdentitySchema = z.object({
  subject: z.string().min(1),
  email: z.string().email(),
  name: z.string().optional(),
  groups: z.array(z.string()).default([]),
  source: z.enum(['trusted-header', 'oidc']),
});
export type ExternalIdentity = z.infer<typeof externalIdentitySchema>;

/** What the login page needs to render the available sign-in option. */
export interface SsoProvidersResponse {
  mode: SsoMode;
  /** Present for oidc: where the login button sends the browser. */
  loginUrl?: string;
  label?: string;
}
