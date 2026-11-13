import { createHmac, timingSafeEqual } from 'node:crypto';
import { assertSessionFresh } from './db.ts';

// lib/session.ts (Next) 와 동일한 토큰 포맷: base64url(payload).base64url(HMAC-SHA256)
export type Role = 'user' | 'judge' | 'admin';
// teamId: 본선 명단 기반 회원가입으로 팀에 연결된 참가자만 가진다 (lib/session.ts 와 동일 포맷)
// tv: token_version. 비밀번호 재발급·권한 변경 시 DB 값이 올라가고, 대조가 실패하면 세션이 무효화된다.
export type Session = { id: string; name: string; role: Role; teamId?: string; tv?: number; exp: number; v: 2 };

const SESSION_COOKIE = 'session';
const DEV_SECRET = 'dev-only-secret-change-me';
const secret = process.env.AUTH_SECRET ?? DEV_SECRET;
// 운영에서는 빈 문자열이나 개발용 기본값 키로 서명되면 안 된다 (Next 쪽과 동일 규칙)
if (process.env.NODE_ENV === 'production' && (!process.env.AUTH_SECRET || secret === DEV_SECRET)) {
  throw new Error('운영 환경에서는 AUTH_SECRET 을 반드시 설정해야 합니다 (기본값·빈 값 금지).');
}

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
    if (session.v !== 2 || session.exp <= Date.now()) return null;
    // 토큰만으로는 모른다 — role/teamId/tv 를 DB 와 대조해 폐기된 세션을 막는다
    if (!assertSessionFresh(session)) return null;
    return session;
  } catch {
    return null;
  }
}
