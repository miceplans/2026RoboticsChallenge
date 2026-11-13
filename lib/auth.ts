import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { SESSION_COOKIE, verifySessionToken, type Role } from './session';

import { assertSessionFresh } from './users';

// 계정은 contest.db users 테이블에서 검증한다 (lib/users.ts).
// 토큰의 role·teamId·tv 를 DB 와 대조해, 비밀번호 재발급·강등 후에도 남은 오래된 세션을 무효화한다.
export async function getSession() {
  const session = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (session && !assertSessionFresh(session)) return null;
  return session;
}

// proxy 에서 1차 차단하지만, 페이지에서도 한 번 더 검증한다.
export async function requireRole(roles: Role[]) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!roles.includes(session.role)) notFound();
  return session;
}
