/**
 * Auth DTOs (PLAN §6.3) — first-run setup + login. Shared so the frontend (T16) and backend
 * validate against the exact same schemas.
 */
import { z } from 'zod';
import { USER_ROLES } from './constants';

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

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Add a member to the current org (admin creates the account directly — MVP invite). */
export const addMemberSchema = z.object({
  email: z.string().email().max(320),
  name: z.string().min(1).max(120).optional(),
  password: passwordSchema,
  role: z.enum(USER_ROLES),
});
export type AddMemberInput = z.infer<typeof addMemberSchema>;

export const updateMemberRoleSchema = z.object({ role: z.enum(USER_ROLES) });
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

/** Public-safe shape of the authenticated user returned by `/api/auth/me`. */
export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  organizationId: string;
  role: string;
}
