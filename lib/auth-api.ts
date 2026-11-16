import type { Role } from './session';

// 계정 DB 는 실시간 서버(EC2)만 연다. Next(Vercel 등)는 서버 간 호출로 로그인·세션 검증을 맡긴다.
// REALTIME_URL: 서버 측 호출용 (없으면 브라우저용 NEXT_PUBLIC_REALTIME_URL 을 쓴다).
const base = () => process.env.REALTIME_URL ?? process.env.NEXT_PUBLIC_REALTIME_URL ?? 'http://localhost:4000';

export type VerifiedUser = { id: string; name: string; role: Role; teamId?: string; tv: number };
export type LoginResult =
  | { ok: true; user: VerifiedUser }
  | { ok: false; error: 'invalid' | 'throttled' | 'unavailable'; retryAfterSec?: number };

async function call(path: string, init: RequestInit & { cookie?: string } = {}) {
  const { cookie, ...rest } = init;
  return fetch(`${base()}${path}`, {
    ...rest,
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  });
}

export async function apiLogin(id: string, password: string, ip: string): Promise<LoginResult> {
  try {
    const res = await call('/auth/login', { method: 'POST', body: JSON.stringify({ id, password, ip }) });
    const data = (await res.json()) as { ok: boolean; error?: string; retryAfterSec?: number; user?: VerifiedUser };
    if (res.ok && data.ok && data.user) return { ok: true, user: data.user };
    if (res.status === 429) return { ok: false, error: 'throttled', retryAfterSec: data.retryAfterSec ?? 600 };
    if (res.status === 401) return { ok: false, error: 'invalid' };
  } catch (e) {
    console.error('실시간 서버 로그인 호출 실패:', e);
  }
  return { ok: false, error: 'unavailable' };
}

// 세션 쿠키가 아직 유효한지(비밀번호 재발급·강등으로 폐기되지 않았는지) 서버에 확인한다. 실패하면 무효로 본다.
export async function apiSessionFresh(token: string): Promise<boolean> {
  try {
    const res = await call('/auth/me', { cookie: `session=${token}` });
    return res.ok;
  } catch (e) {
    console.error('실시간 서버 세션 확인 실패:', e);
    return false;
  }
}

export type PasswordResult = { ok: true; tv: number } | { ok: false; error: 'invalid' | 'throttled' | 'unavailable'; retryAfterSec?: number };

export async function apiChangePassword(token: string, current: string, next: string): Promise<PasswordResult> {
  try {
    const res = await call('/auth/password', { method: 'POST', cookie: `session=${token}`, body: JSON.stringify({ current, next }) });
    const data = (await res.json()) as { ok: boolean; tv?: number; retryAfterSec?: number };
    if (res.ok && data.ok && typeof data.tv === 'number') return { ok: true, tv: data.tv };
    if (res.status === 429) return { ok: false, error: 'throttled', retryAfterSec: data.retryAfterSec ?? 600 };
    if (res.status === 401) return { ok: false, error: 'invalid' };
  } catch (e) {
    console.error('실시간 서버 비밀번호 변경 호출 실패:', e);
  }
  return { ok: false, error: 'unavailable' };
}
