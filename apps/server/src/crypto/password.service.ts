import { Injectable } from '@nestjs/common';
import { webcrypto } from 'node:crypto';
import { argon2Verify, argon2id } from 'hash-wasm';

/**
 * Password hashing via argon2id from `hash-wasm` — pure WASM, ZERO native binary, so `npx
 * pingwatch` works on any platform/arch (PLAN §6.2). The encoded PHC string carries its own salt
 * + params, so `verify` needs only the password + stored hash.
 */
@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    const salt = webcrypto.getRandomValues(new Uint8Array(16));
    return argon2id({
      password,
      salt,
      parallelism: 1,
      iterations: 3,
      memorySize: 65_536, // 64 MiB
      hashLength: 32,
      outputType: 'encoded',
    });
  }

  async verify(password: string, hash: string): Promise<boolean> {
    try {
      return await argon2Verify({ password, hash });
    } catch {
      return false;
    }
  }
}
