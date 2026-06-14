import type { SecretBackend } from './secret-backend';

/** Reads the master secret from APP_SECRET / PINGWATCH_APP_SECRET; never touches disk. */
export class EnvSecretBackend implements SecretBackend {
  load(): Promise<string> {
    const secret = process.env.APP_SECRET ?? process.env.PINGWATCH_APP_SECRET;
    if (!secret || secret.length === 0) {
      throw new Error('PINGWATCH_SECRET_BACKEND=env but APP_SECRET (or PINGWATCH_APP_SECRET) is not set.');
    }
    return Promise.resolve(secret);
  }
}
