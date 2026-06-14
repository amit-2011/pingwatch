import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@pingwatch/shared';

export const ROLES_KEY = 'pingwatch:roles';

/** Require the caller's role to meet the lowest listed role (RBAC — PLAN §6.4). */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
