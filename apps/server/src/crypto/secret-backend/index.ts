import type { ResolvedConfig } from '../../config/schema';
import { EnvSecretBackend } from './env.backend';
import { FileSecretBackend } from './file.backend';
import { KmsSecretBackend } from './kms.backend';
import type { SecretBackend } from './secret-backend';

export type { SecretBackend };

/** Pick the master-secret backend from config (P4.5). Defaults to the file backend. */
export function selectSecretBackend(config: ResolvedConfig): SecretBackend {
  switch (config.secretBackend.kind) {
    case 'env':
      return new EnvSecretBackend();
    case 'kms':
      return new KmsSecretBackend({
        endpoint: config.secretBackend.kmsEndpoint,
        token: config.secretBackend.kmsToken,
        command: config.secretBackend.kmsCommand,
        keyId: config.secretBackend.kmsKeyId,
      });
    default:
      return new FileSecretBackend(config.dataDir);
  }
}
