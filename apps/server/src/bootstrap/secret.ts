/**
 * Resolve the single APP_SECRET (PLAN §6.7): env → `<dataDir>/secret.key` (0600) → generate.
 * This secret signs JWTs and HKDF-derives the notification-secret data key (wired in T6); for T4
 * we only guarantee it exists and is persisted with tight permissions. MUST be in backups.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ResolvedConfig } from '../config/schema';
import { selectSecretBackend } from '../crypto/secret-backend';

/** Resolve the master secret via the configured backend (file | env | kms) — P4.5. */
export function ensureMasterSecret(config: ResolvedConfig): Promise<string> {
  return selectSecretBackend(config).load();
}

export function ensureSecret(dataDir: string): string {
  const fromEnv = process.env.APP_SECRET ?? process.env.PINGWATCH_APP_SECRET;
  if (fromEnv && fromEnv.length > 0) return fromEnv;

  const secretPath = path.join(dataDir, 'secret.key');
  if (fs.existsSync(secretPath)) {
    return fs.readFileSync(secretPath, 'utf8').trim();
  }

  const secret = crypto.randomBytes(32).toString('base64url');
  fs.writeFileSync(secretPath, secret, { mode: 0o600 });
  fs.chmodSync(secretPath, 0o600); // enforce even if umask widened the create mode
  return secret;
}
