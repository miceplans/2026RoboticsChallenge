import { createHmac, timingSafeEqual } from 'node:crypto';
import { assertSessionFresh } from './db.ts';

// lib/session.ts (Next) 와 동일한 토큰 포맷: base64url(payload).base64url(HMAC-SHA256)
export type Role = 'user' | 'judge' | 'admin';
// teamId: 본선 명단 기반 회원가입으로 팀에 연결된 참가자만 가진다 (lib/session.ts 와 동일 포맷)
// tv: token_version. 비밀번호 재발급·권한 변경 시 DB 값이 올라가고, 대조가 실패하면 세션이 무효화된다.
// mc: must_change — 관리자가 재발급하거나 기본 비밀번호 계정이면 1. 쓰기 요청을 막는다.
export type Session = { id: string; name: string; role: Role; teamId?: string; tv?: number; mc?: 0 | 1; exp: number; v: 2 };

const SESSION_COOKIE = 'session';
const DEV_SECRET = 'dev-only-secret-change-me';
const MIN_SECRET_LEN = 32;
const secret = process.env.AUTH_SECRET ?? DEV_SECRET;

// AUTH_SECRET 검사 규칙은 lib/session.ts (Next) 와 동일하게 유지한다 — 한쪽만 바꾸면 서명이 어긋난다.
export function assertAuthSecret(): void {
  const s = process.env.AUTH_SECRET;
  if (s && s !== DEV_SECRET && s.length >= MIN_SECRET_LEN) return;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`운영 환경에서는 AUTH_SECRET 을 ${MIN_SECRET_LEN}자 이상으로 반드시 설정해야 합니다 (기본값·빈 값·짧은 값 금지).`);
  }
  if (s && s.length < MIN_SECRET_LEN) console.warn(`AUTH_SECRET 이 ${MIN_SECRET_LEN}자 미만입니다. 개발용으로만 쓰세요.`);
}
assertAuthSecret();

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
