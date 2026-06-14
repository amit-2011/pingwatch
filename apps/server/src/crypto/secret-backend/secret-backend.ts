/**
 * Pluggable source of the master APP_SECRET (P4.5). The default is the file backend (current
 * behavior); `env` and `kms` are opt-in. Whatever string `load()` returns drives BOTH the JWT
 * HS256 key and the SecretBox HKDF data key exactly as before — rotating it logs everyone out AND
 * requires re-sealing channel configs (same blast radius as rotating secret.key today).
 */
export interface SecretBackend {
  load(): Promise<string>;
}
