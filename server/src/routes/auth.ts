import { recordAttempt, recordFail, throttle } from '../rate-limit.ts';
import { changeOwnPassword, renameOwnAccount, touchLogin, verifyUser } from '../db.ts';
import { clientIpOf } from '../guards.ts';
import { Router, body, internalOnly, requireRole, requireSession } from '../router.ts';
import { json } from '../http.ts';
import { obj, opt, str } from '../validate.ts';

// --- 인증 (Next 서버 액션이 서버 간 호출로 쓴다. 웹이 다른 호스트(Vercel)여도 DB 는 이 서버만 연다) ---
// 모두 웹 서버 전용 — 난수 공유 비밀(INTERNAL_API_SECRET)이 틀리면 거절한다 (internalOnly 가드).

const loginBody = obj({ id: str(), password: str(), ip: opt(str()) });
const nameBody = obj({ name: str({ min: 1, max: 20 }) });
const passwordBody = obj({ current: str(), next: str() });

export function createAuthRoutes(): Router {
  const r = new Router();

  // 로그인: 비밀번호 검증 + 시도 제한. 세션 쿠키는 Next 가 같은 AUTH_SECRET 으로 직접 서명해 설정한다.
  r.post('/auth/login', internalOnly, body(loginBody, 4096), async (ctx) => {
    const { id: rawId, password, ip } = ctx.body as ReturnType<typeof loginBody>;
    const id = rawId.trim().slice(0, 64);
    const ipAddr = clientIpOf(ctx.req, ip);
    // 계정+IP 단위 한도가 주 방어선이다. 계정 전체 한도는 분산 무차별 대입의 마지노선으로만 둔다 —
    // 임계치를 낮추면 누구든 남의 계정을 일부러 틀려서 잠그는 DoS 가 되기 때문이다 (짧은 시간만 잠근다).
    const keys = [`login:${ipAddr}:${id.toLowerCase()}`, `login-id:${id.toLowerCase()}`];
    const limits = [5, 30];
    const blocks = [10 * 60_000, 3 * 60_000];
    for (const [i, key] of keys.entries()) {
      const gate = throttle(key, limits[i], 10 * 60_000, blocks[i]);
      if (!gate.ok) return void json(ctx.res, 429, { ok: false, error: 'throttled', retryAfterSec: gate.retryAfterSec });
    }
    keys.forEach((key) => recordAttempt(key, 10 * 60_000));
    const user = await verifyUser(id, password);
    if (!user) {
      keys.forEach(recordFail);
      return void json(ctx.res, 401, { ok: false, error: 'invalid' });
    }
    touchLogin(user.id);
    json(ctx.res, 200, { ok: true, user });
  });

  // 세션 최신성 확인: Next 가 받은 쿠키를 그대로 전달한다 (비밀번호 재발급·강등으로 무효화된 세션 차단)
  r.get('/auth/me', internalOnly, (ctx) => {
    json(ctx.res, ctx.session ? 200 : 401, ctx.session ? { ok: true } : { ok: false, error: 'unauthorized' });
  });

  // 본인 비밀번호 변경
  r.post('/auth/password', internalOnly, requireSession, body(passwordBody, 4096), async (ctx) => {
    const { current, next } = ctx.body as ReturnType<typeof passwordBody>;
    const s = ctx.session!;
    const key = `pwchange:${s.id}`;
    const gate = throttle(key, 5, 10 * 60_000, 10 * 60_000);
    if (!gate.ok) return void json(ctx.res, 429, { ok: false, error: 'throttled', retryAfterSec: gate.retryAfterSec });
    recordAttempt(key, 10 * 60_000);
    if (!(await verifyUser(s.id, current))) {
      recordFail(key);
      return void json(ctx.res, 401, { ok: false, error: 'invalid' });
    }
    json(ctx.res, 200, { ok: true, tv: await changeOwnPassword(s.id, next) });
  });

  // 심판 본인의 표시 이름 변경 (서명에 들어가는 이름)
  r.post('/auth/name', internalOnly, requireSession, requireRole('judge'), body(nameBody, 1024), (ctx) => {
    const name = (ctx.body as ReturnType<typeof nameBody>).name.replace(/\s+/g, ' ').trim();
    if (!name) return void json(ctx.res, 400, { ok: false, error: 'invalid' });
    if (!renameOwnAccount(ctx.session!.id, name)) return void json(ctx.res, 404, { ok: false, error: 'not_found' });
    json(ctx.res, 200, { ok: true, name });
  });

  return r;
}
