import type { Request } from 'express';
import type { UserRole } from '@pingwatch/shared';

/** The authenticated principal attached to the request by JwtAuthGuard. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
  organizationId: string;
  role: UserRole;
}

export interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}
