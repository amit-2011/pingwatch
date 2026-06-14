import { SetMetadata } from '@nestjs/common';
import type { TokenScope } from '@pingwatch/shared';

export const REQUIRED_SCOPE_KEY = 'pingwatch:requiredScope';

/** Require an API token with at least the given scope (admin ⇒ write ⇒ read). */
export const RequiredScope = (scope: TokenScope) => SetMetadata(REQUIRED_SCOPE_KEY, scope);
