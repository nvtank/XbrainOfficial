/** Minimal signed guest tokens (HMAC-SHA256). Stable identity without passwords. */
import crypto from 'node:crypto';
import { config } from '../config';

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 180; // 180 days

const b64 = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');
const sign = (payload: string) => crypto.createHmac('sha256', config.authSecret).update(payload).digest('base64url');

export interface TokenPayload {
  uid: string;
  exp: number;
}

export function issueToken(userId: string): string {
  const payload = b64(JSON.stringify({ uid: userId, exp: Date.now() + TOKEN_TTL_MS } satisfies TokenPayload));
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: unknown): TokenPayload | null {
  if (typeof token !== 'string' || token.length > 512) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as TokenPayload;
    if (typeof data.uid !== 'string' || typeof data.exp !== 'number' || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
