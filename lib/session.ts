export type Role = 'user' | 'judge' | 'admin';

// teamId: 본선 명단 기반 회원가입으로 팀에 연결된 참가자만 가진다
export type Session = { id: string; name: string; role: Role; teamId?: string; exp: number; v: 2 };

export const SESSION_COOKIE = 'session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

const secret = process.env.AUTH_SECRET ?? 'dev-only-secret-change-me';
const enc = new TextEncoder();

const toB64Url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromB64Url = (s: string) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
};

const hmacKey = () => crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

const sign = async (data: string) => toB64Url(await crypto.subtle.sign('HMAC', await hmacKey(), enc.encode(data)));

export async function createSessionToken(user: Omit<Session, 'exp' | 'v'>) {
  const payload = toB64Url(enc.encode(JSON.stringify({ ...user, exp: Date.now() + SESSION_MAX_AGE * 1000, v: 2 })));
  return `${payload}.${await sign(payload)}`;
}

export async function verifySessionToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig || (await sign(payload)) !== sig) return null;
  try {
    const session = JSON.parse(new TextDecoder().decode(Uint8Array.from(fromB64Url(payload), (c) => c.charCodeAt(0)))) as Session;
    return session.v === 2 && session.exp > Date.now() ? session : null;
  } catch {
    return null;
  }
}
