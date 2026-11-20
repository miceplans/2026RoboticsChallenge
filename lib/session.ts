export type Role = 'user' | 'judge' | 'admin';

export type Session = { id: string; name: string; role: Role; exp: number };

export const SESSION_COOKIE = 'session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

// 운영에서 AUTH_SECRET 이 없으면 위조 가능한 기본값을 쓰지 않고 실패시킨다 (빌드 시점이 아니라 사용 시점에 검사).
const getSecret = () => {
  const s = process.env.AUTH_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === 'production') throw new Error('AUTH_SECRET 환경변수가 필요합니다.');
  return 'dev-only-secret-change-me';
};
const enc = new TextEncoder();

const toB64Url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromB64Url = (s: string) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
};

const hmacKey = () => crypto.subtle.importKey('raw', enc.encode(getSecret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

const sign = async (data: string) => toB64Url(await crypto.subtle.sign('HMAC', await hmacKey(), enc.encode(data)));

export async function createSessionToken(user: Omit<Session, 'exp'>) {
  const payload = toB64Url(enc.encode(JSON.stringify({ ...user, exp: Date.now() + SESSION_MAX_AGE * 1000 })));
  return `${payload}.${await sign(payload)}`;
}

export async function verifySessionToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig || (await sign(payload)) !== sig) return null;
  try {
    const session = JSON.parse(new TextDecoder().decode(Uint8Array.from(fromB64Url(payload), (c) => c.charCodeAt(0)))) as Session;
    return session.exp > Date.now() ? session : null;
  } catch {
    return null;
  }
}
