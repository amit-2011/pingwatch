/** Injection tokens for runtime values provided at bootstrap (resolved secret, DB client, config). */
export const APP_SECRET = Symbol('PINGWATCH_APP_SECRET');
export const PRISMA_CLIENT = Symbol('PINGWATCH_PRISMA_CLIENT');
export const PINGWATCH_CONFIG = Symbol('PINGWATCH_CONFIG');
