import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { SecretBackend } from './secret-backend';

/** Default backend: env → `<dataDir>/secret.key` (0600) → generate. The original ensureSecret body. */
export class FileSecretBackend implements SecretBackend {
  constructor(private readonly dataDir: string) {}

  load(): Promise<string> {
    const fromEnv = process.env.APP_SECRET ?? process.env.PINGWATCH_APP_SECRET;
    if (fromEnv && fromEnv.length > 0) return Promise.resolve(fromEnv);

    const secretPath = path.join(this.dataDir, 'secret.key');
    if (fs.existsSync(secretPath)) {
      return Promise.resolve(fs.readFileSync(secretPath, 'utf8').trim());
    }
    const secret = crypto.randomBytes(32).toString('base64url');
    fs.writeFileSync(secretPath, secret, { mode: 0o600 });
    fs.chmodSync(secretPath, 0o600); // enforce even if umask widened the create mode
    return Promise.resolve(secret);
  }
}
