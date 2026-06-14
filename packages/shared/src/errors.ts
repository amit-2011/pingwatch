/**
 * The single error envelope returned by every API error (PLAN §6.8). The Nest global
 * exception filter emits this exact shape; the frontend keys its error handling off `code`,
 * not off HTTP status or message text.
 */

export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'SETUP_REQUIRED',
  'INVALID_CREDENTIALS',
  'PASSWORD_REQUIRED',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorEnvelope {
  code: ErrorCode;
  message: string;
  /** Optional structured context (e.g. zod field issues). Never contains secrets. */
  details?: unknown;
}

/** Narrowing guard for code that consumes API responses (frontend + tests). */
export function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['code'] === 'string' &&
    (ERROR_CODES as readonly string[]).includes(v['code']) &&
    typeof v['message'] === 'string'
  );
}
