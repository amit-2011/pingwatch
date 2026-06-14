import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { SecretBackend } from './secret-backend';

const execFileAsync = promisify(execFile);

export interface KmsOptions {
  endpoint?: string | undefined;
  token?: string | undefined;
  command?: string | undefined;
  keyId?: string | undefined;
}

/**
 * External KMS / secret-store backend (P4.5). Either runs a command whose stdout is the secret, or
 * POSTs the keyId to an HTTP endpoint and reads `{ key | secret }` from the JSON. The returned value
 * IS the master secret and is NEVER written to disk. (For AWS KMS / Vault, point `kmsCommand` at the
 * provider's CLI, e.g. `aws kms decrypt … --output text --query Plaintext`.)
 */
export class KmsSecretBackend implements SecretBackend {
  constructor(private readonly opts: KmsOptions) {}

  async load(): Promise<string> {
    if (this.opts.command) {
      const { stdout } = await execFileAsync('sh', ['-c', this.opts.command], { encoding: 'utf8' });
      const secret = stdout.trim();
      if (!secret) throw new Error('PINGWATCH_KMS_COMMAND produced no output.');
      return secret;
    }
    if (this.opts.endpoint) {
      const res = await fetch(this.opts.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.opts.token ? { authorization: `Bearer ${this.opts.token}` } : {}),
        },
        body: JSON.stringify({ keyId: this.opts.keyId ?? null }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`KMS endpoint returned HTTP ${res.status}`);
      const data = (await res.json()) as { key?: string; secret?: string };
      const secret = data.key ?? data.secret;
      if (!secret) throw new Error('KMS endpoint response missing "key" (or "secret").');
      return secret;
    }
    throw new Error('KMS secret backend requires kmsCommand or kmsEndpoint.');
  }
}
