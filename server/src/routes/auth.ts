import type { IncomingMessage, ServerResponse } from 'node:http';
import { recordAttempt, recordFail, throttle } from '../rate-limit.ts';
import { changeOwnPassword, touchLogin, verifyUser } from '../db.ts';
import type { Session } from '../session.ts';
import { clientIpOf, internalOk } from '../guards.ts';
import { bad, json, readJson } from '../http.ts';

// --- 인증 (Next 서버 액션이 서버 간 호출로 쓴다. 웹이 다른 호스트(Vercel)여도 DB 는 이 서버만 연다) ---
// 모두 웹 서버 전용 — 난수 공유 비밀(INTERNAL_API_SECRET)이 틀리면 거절한다.
// 이 경로를 처리했으면 true 를 돌려준다.

export async function handleAuth(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  method: string,
  session: Session | null,
): Promise<boolean> {
  // 로그인: 비밀번호 검증 + 시도 제한. 세션 쿠키는 Next 가 같은 AUTH_SECRET 으로 직접 서명해 설정한다.
  if (url.pathname === '/auth/login' && method === 'POST') {
    if (!internalOk(req)) return json(res, 403, { ok: false, error: 'forbidden' }), true;
    const body = (await readJson(req, 4096)) as { id?: unknown; password?: unknown; ip?: unknown } | null;
    if (!body || typeof body.id !== 'string' || typeof body.password !== 'string') return bad(res), true;
    const id = body.id.trim().slice(0, 64);
    const ip = clientIpOf(req, body.ip);
    // 계정+IP 단위 한도가 주 방어선이다. 계정 전체 한도는 분산 무차별 대입의 마지노선으로만 둔다 —
    // 임계치를 낮추면 누구든 남의 계정을 일부러 틀려서 잠그는 DoS 가 되기 때문이다 (짧은 시간만 잠근다).
    const keys = [`login:${ip}:${id.toLowerCase()}`, `login-id:${id.toLowerCase()}`];
    const limits = [5, 30];
    const blocks = [10 * 60_000, 3 * 60_000];
    for (const [i, key] of keys.entries()) {
      const gate = throttle(key, limits[i], 10 * 60_000, blocks[i]);
      if (!gate.ok) return json(res, 429, { ok: false, error: 'throttled', retryAfterSec: gate.retryAfterSec }), true;
    }
    keys.forEach((key) => recordAttempt(key, 10 * 60_000));
    const user = await verifyUser(id, body.password);
    if (!user) {
      keys.forEach(recordFail);
      return json(res, 401, { ok: false, error: 'invalid' }), true;
    }
    touchLogin(user.id);
    return json(res, 200, { ok: true, user }), true;
  }

  // 세션 최신성 확인: Next 가 받은 쿠키를 그대로 전달한다 (비밀번호 재발급·강등으로 무효화된 세션 차단)
  if (url.pathname === '/auth/me' && method === 'GET') {
    if (!internalOk(req)) return json(res, 403, { ok: false, error: 'forbidden' }), true;
    return json(res, session ? 200 : 401, session ? { ok: true } : { ok: false, error: 'unauthorized' }), true;
  }

  // 본인 비밀번호 변경
  if (url.pathname === '/auth/password' && method === 'POST') {
    if (!internalOk(req)) return json(res, 403, { ok: false, error: 'forbidden' }), true;
    if (!session) return json(res, 401, { ok: false, error: 'unauthorized' }), true;
    const body = (await readJson(req, 4096)) as { current?: unknown; next?: unknown } | null;
    if (!body || typeof body.current !== 'string' || typeof body.next !== 'string') return bad(res), true;
    const key = `pwchange:${session.id}`;
    const gate = throttle(key, 5, 10 * 60_000, 10 * 60_000);
    if (!gate.ok) return json(res, 429, { ok: false, error: 'throttled', retryAfterSec: gate.retryAfterSec }), true;
    recordAttempt(key, 10 * 60_000);
    if (!(await verifyUser(session.id, body.current))) {
      recordFail(key);
      return json(res, 401, { ok: false, error: 'invalid' }), true;
    }
    return json(res, 200, { ok: true, tv: await changeOwnPassword(session.id, body.next) }), true;
  }

  return false;
}
