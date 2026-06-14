import type { Request, Response } from 'express';

export const REFRESH_COOKIE = 'pingwatch_refresh';
const REFRESH_PATH = '/api/auth';

/** HttpOnly; SameSite=Lax; Path=/api/auth; Secure auto-dropped on localhost-over-http (PLAN §6.1). */
export function setRefreshCookie(req: Request, res: Response, raw: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE, raw, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    path: REFRESH_PATH,
    expires: expiresAt,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: REFRESH_PATH });
}

export function readRefreshCookie(req: Request): string | undefined {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  return cookies?.[REFRESH_COOKIE];
}
