export type Role = 'user' | 'judge' | 'admin';

// teamId: 본선 명단 기반 회원가입으로 팀에 연결된 참가자만 가진다
// tv: token_version — 비밀번호 재발급·권한 변경 시 DB 값이 올라가며 세션과 대조해 폐기한다.
// mc: must_change — 관리자가 재발급하거나 기본 비밀번호 계정이면 1. 프록시가 /password 로 별내고, 서버가 쓰기를 막는다.
export type Session = { id: string; name: string; role: Role; teamId?: string; tv?: number; mc?: 0 | 1; exp: number; v: 2 };

export const SESSION_COOKIE = 'session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;
// 발급 후 이 시간이 지난 세션은 요청 때 새 토큰으로 갈아끼운다 (슬라이딩 만료, 하루 1회 이하).
export const SESSION_REFRESH_AFTER_MS = 60 * 60 * 24 * 1000;

const DEV_SECRET = 'dev-only-secret-change-me';
const MIN_SECRET_LEN = 32;
const secret = process.env.AUTH_SECRET ?? DEV_SECRET;

// 운영에서는 빈 문자열·개발용 기본값·짧은 키로 서명되면 안 된다 (server/src/session.ts 와 동일 규칙).
// 모듈 import(빌드/프리렌더) 시점이 아니라 실제 서명·검증 시점에만 검사한다.
const assertSecret = () => {
  const s = process.env.AUTH_SECRET;
  if (s && s !== DEV_SECRET && s.length >= MIN_SECRET_LEN) return;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`운영 환경에서는 AUTH_SECRET 을 ${MIN_SECRET_LEN}자 이상으로 반드시 설정해야 합니다 (기본값·빈 값·짧은 값 금지).`);
  }
  if (s && s.length < MIN_SECRET_LEN) console.warn(`AUTH_SECRET 이 ${MIN_SECRET_LEN}자 미만입니다. 개발용으로만 쓰세요.`);
};
const enc = new TextEncoder();

const toB64Url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromB64Url = (s: string) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
};

const hmacKey = () => {
  assertSecret();
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
};

const sign = async (data: string) => toB64Url(await crypto.subtle.sign('HMAC', await hmacKey(), enc.encode(data)));

// 서명 비교는 상수 시간으로 한다 — 길이는 이미 위에서 검사하고(= 단축 평가), 내용 비교만 누적 XOR 로 한다.
const timingSafeEqualStr = (a: string, b: string): boolean => {
  const ba = Uint8Array.from(a, (c) => c.charCodeAt(0));
  const bb = Uint8Array.from(b, (c) => c.charCodeAt(0));
  if (ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= ba[i] ^ bb[i];
  return diff === 0;
};

export async function createSessionToken(user: Omit<Session, 'exp' | 'v'>) {
  const payload = toB64Url(enc.encode(JSON.stringify({ ...user, exp: Date.now() + SESSION_MAX_AGE * 1000, v: 2 })));
  return `${payload}.${await sign(payload)}`;
}

export const needsRefresh = (session: Session) => session.exp - Date.now() < SESSION_MAX_AGE * 1000 - SESSION_REFRESH_AFTER_MS;

export async function verifySessionToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = await sign(payload);
  if (expected.length !== sig.length || !timingSafeEqualStr(expected, sig)) return null;
  try {
    const session = JSON.parse(new TextDecoder().decode(Uint8Array.from(fromB64Url(payload), (c) => c.charCodeAt(0)))) as Session;
    return session.v === 2 && session.exp > Date.now() ? session : null;
  } catch {
    return null;
  }
}
