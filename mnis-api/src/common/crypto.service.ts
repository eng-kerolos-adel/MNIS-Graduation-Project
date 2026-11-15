import { Global, Injectable, Module } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'crypto';
import { env } from '../config/env';

/** Field-level encryption (AES-256-GCM), searchable blind index (HMAC-SHA256) and token hashing. */
@Injectable()
export class CryptoService {
  private readonly key = Buffer.from(env.ENCRYPTION_KEY, 'base64');

  constructor() {
    if (this.key.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be base64 for exactly 32 bytes');
    }
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v1', iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
  }

  decrypt(payload: string): string {
    const [v, iv, tag, data] = payload.split(':');
    if (v !== 'v1' || !iv || !tag || !data) throw new Error('Bad ciphertext');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  }

  /** Deterministic keyed hash so we can look a patient up by national ID without storing it in clear. */
  blindIndex(value: string): string {
    return createHmac('sha256', env.BLIND_INDEX_KEY).update(value.trim()).digest('hex');
  }

  sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  hmacSign(value: string): string {
    return createHmac('sha256', env.RX_SIGNING_KEY).update(value).digest('hex');
  }
}

@Global()
@Module({ providers: [CryptoService], exports: [CryptoService] })
export class CryptoModule {}
