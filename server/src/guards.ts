import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

// --- 서버 간 호출·클이언트 식별 공통 가드 ---

// 앞에 신뢰할 프록시(Caddy 등)가 있을 때만 1 — 클라이언트 IP 를 x-forwarded-for 에서 읽는다.
export const TRUST_PROXY = process.env.TRUST_PROXY === '1';

// Next 서버(배포 웹 컨테이너)만 /auth/* 를 호출하게 막는 공유 비밀. 운영에서는 index.ts 가
// 시작 시 미설정이면 멈추게 한다. 여기서는 미설정이면 검사를 건다 (개발 편의).
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET ?? '';
export const internalOk = (req: IncomingMessage): boolean => {
  if (!INTERNAL_API_SECRET) return true;
  const a = req.headers['x-internal-secret'];
  const sent = Array.isArray(a) ? a[0] : a;
  if (!sent) return false;
  const ba = Buffer.from(sent);
  const bb = Buffer.from(INTERNAL_API_SECRET);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
};

// 클라이언트 IP. 로그인 본문의 ip 는 웹 서버가 본 요청에서 검증해 본 값이라 우선 쓰고,
// 없으면 소켓 주소(TRUST_PROXY 면 x-forwarded-for)를 본다.
export const clientIpOf = (req: IncomingMessage, bodyIp?: unknown): string => {
  if (typeof bodyIp === 'string' && bodyIp.trim()) return bodyIp.trim().slice(0, 64);
  const fwd = req.headers['x-forwarded-for'];
  if (TRUST_PROXY && typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim().slice(0, 64);
  return (req.socket.remoteAddress ?? 'local').slice(0, 64);
};
