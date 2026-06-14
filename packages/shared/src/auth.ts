/**
 * Auth DTOs (PLAN §6.3) — first-run setup + login. Shared so the frontend (T16) and backend
 * validate against the exact same schemas.
 */
import { z } from 'zod';

export const passwordSchema = z.string().min(8).max(200);

export const loginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const setupSchema = z.object({
  email: z.string().email().max(320),
  password: passwordSchema,
  name: z.string().min(1).max(120).optional(),
  orgName: z.string().min(1).max(120).optional(),
});
export type SetupInput = z.infer<typeof setupSchema>;

/** Public-safe shape of the authenticated user returned by `/api/auth/me`. */
export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  organizationId: string;
  role: string;
}
