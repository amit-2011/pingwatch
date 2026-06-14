import { Inject, Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { APP_SECRET } from '../common/di-tokens';

/**
 * Authenticated encryption for secrets-at-rest (PLAN §6.7): notification creds etc. are sealed as
 * `v1:<iv>:<tag>:<ciphertext>` (all base64) with AES-256-GCM. The data key is HKDF-derived from
 * the single APP_SECRET, so rotating APP_SECRET re-keys everything; the `v1:` prefix leaves room
 * for future KMS/rotation.
 */
@Injectable()
export class SecretBoxService {
  private readonly key: Buffer;

  constructor(@Inject(APP_SECRET) appSecret: string) {
    this.key = Buffer.from(
      hkdfSync('sha256', Buffer.from(appSecret, 'utf8'), new Uint8Array(0), 'pingwatch:secretbox:v1', 32),
    );
  }

  seal(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
  }

  open(sealed: string): string {
    const parts = sealed.split(':');
    if (parts.length !== 4 || parts[0] !== 'v1') {
      throw new Error('Unsupported SecretBox payload');
    }
    const iv = Buffer.from(parts[1]!, 'base64');
    const tag = Buffer.from(parts[2]!, 'base64');
    const ciphertext = Buffer.from(parts[3]!, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }
}
