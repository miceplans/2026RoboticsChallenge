// 로그인·가입 시도 제한 (인메모리 슬라이딩 윈도우). 서버가 1대라 인메모리로 충분하다.
// 임시 비밀번호가 짧아 무차별 대입에 약하므로, 틀린 시도가 임계치에 도달하면 일정 시간 차단한다.

type Entry = { attempts: number[]; fails: number[]; blockedUntil: number };

const buckets = new Map<string, Entry>();

// 가끔 만료된 키를 비운다 (메모리 방지)
const sweeper = setInterval(() => {
  const cutoff = Date.now() - 24 * 3600_000;
  for (const [key, e] of buckets) {
    e.attempts = e.attempts.filter((t) => t > cutoff);
    e.fails = e.fails.filter((t) => t > cutoff);
    if (!e.attempts.length && !e.fails.length && e.blockedUntil < Date.now()) buckets.delete(key);
  }
}, 3600_000);
sweeper.unref();

const entryOf = (key: string): Entry => {
  const cur = buckets.get(key);
  if (cur) return cur;
  const e: Entry = { attempts: [], fails: [], blockedUntil: 0 };
  buckets.set(key, e);
  return e;
};

export type ThrottleResult = { ok: true } | { ok: false; retryAfterSec: number };

/** 시도를 허용하는지 본다. 허용하면 호출 측이 끝난 뒤 recordAttempt/fail 을 남긴다. */
export function throttle(key: string, maxFails: number, failWindowMs: number, blockMs: number): ThrottleResult {
  const e = entryOf(key);
  const now = Date.now();
  if (e.blockedUntil > now) return { ok: false, retryAfterSec: Math.ceil((e.blockedUntil - now) / 1000) };
  e.fails = e.fails.filter((t) => t > now - failWindowMs);
  if (e.fails.length >= maxFails) {
    e.blockedUntil = now + blockMs;
    return { ok: false, retryAfterSec: Math.ceil(blockMs / 1000) };
  }
  return { ok: true };
}

export function recordAttempt(key: string, windowMs: number): void {
  const e = entryOf(key);
  const now = Date.now();
  e.attempts = e.attempts.filter((t) => t > now - windowMs);
  e.attempts.push(now);
}

export function recordFail(key: string): void {
  entryOf(key).fails.push(Date.now());
}
