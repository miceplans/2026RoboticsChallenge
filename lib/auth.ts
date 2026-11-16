import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { SESSION_COOKIE, verifySessionToken, type Role } from './session';

import { apiSessionFresh } from './auth-api';

// 계정 DB 는 실시간 서버가 갖고 있다 (lib/auth-api.ts).
// 토큰의 role·teamId·tv 를 서버가 DB 와 대조해, 비밀번호 재발급·강등 후에도 남은 오래된 세션을 무효화한다.
export async function getSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(token);
  if (!session || !token || !(await apiSessionFresh(token))) return null;
  return session;
}

// proxy 에서 1차 차단하지만, 페이지에서도 한 번 더 검증한다.
export async function requireRole(roles: Role[]) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!roles.includes(session.role)) notFound();
  return session;
}
