import { randomInt } from 'crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** Random temporary password (no ambiguous characters). Always contains letters and digits. */
export function generateTempPassword(length = 12): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return /\d/.test(out) && /[A-Za-z]/.test(out) ? out : generateTempPassword(length);
}
