import { createHmac, timingSafeEqual } from 'node:crypto';

// lib/session.ts (Next) 와 동일한 토큰 포맷: base64url(payload).base64url(HMAC-SHA256)
export type Role = 'user' | 'judge' | 'admin';
export type Session = { id: string; name: string; role: Role; exp: number };

const SESSION_COOKIE = 'session';
// 운영(NODE_ENV=production)에서 AUTH_SECRET 이 없으면 기동 자체를 막는다.
if (!process.env.AUTH_SECRET && process.env.NODE_ENV === 'production') throw new Error('AUTH_SECRET 환경변수가 필요합니다.');
const secret = process.env.AUTH_SECRET ?? 'dev-only-secret-change-me';

export function sessionFromCookie(cookieHeader: string | undefined): Session | null {
  const token = cookieHeader
    ?.split(';')
    .map((c) => c.trim().split('='))
    .find(([name]) => name === SESSION_COOKIE)?.[1];
  if (!token) return null;

  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;

  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Session;
    return session.exp > Date.now() ? session : null;
  } catch {
    return null;
  }
}
