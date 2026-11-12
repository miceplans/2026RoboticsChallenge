import { createHmac, timingSafeEqual } from 'node:crypto';

// lib/session.ts (Next) 와 동일한 토큰 포맷: base64url(payload).base64url(HMAC-SHA256)
export type Role = 'user' | 'judge' | 'admin';
// teamId: 본선 명단 기반 회원가입으로 팀에 연결된 참가자만 가진다 (lib/session.ts 와 동일 포맷)
export type Session = { id: string; name: string; role: Role; teamId?: string; exp: number; v: 2 };

const SESSION_COOKIE = 'session';
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
    return session.v === 2 && session.exp > Date.now() ? session : null;
  } catch {
    return null;
  }
}
