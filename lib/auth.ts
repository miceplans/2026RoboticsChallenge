import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { SESSION_COOKIE, verifySessionToken, type Role } from './session';

// TODO: 실제 DB/인증 연동 시 교체. 현재는 데모용 계정.
export const demoUsers = [
  { id: 'user1', password: 'user1234', name: '일반 참가자', role: 'user' },
  { id: 'judge1', password: 'judge1234', name: '심판', role: 'judge' },
  { id: 'admin1', password: 'admin1234', name: '관리자', role: 'admin' },
] as const;

export async function getSession() {
  return verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}

// proxy 에서 1차 차단하지만, 페이지에서도 한 번 더 검증한다.
export async function requireRole(roles: Role[]) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!roles.includes(session.role)) notFound();
  return session;
}
