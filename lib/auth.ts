import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { SESSION_COOKIE, verifySessionToken, type Role } from './session';

type Account = { id: string; password: string; name: string; role: Role };

// 심판 REF01~REF05. 비밀번호는 기본 'robotics!'. JUDGE_PASSWORDS 로 계정별 덮어쓸 수 있다.
//   JUDGE_PASSWORDS=pw01,pw02,pw03,pw04,pw05   (REF01 부터 순서대로)
//   ADMIN_PASSWORD=...                          (admin1)
// 관리자(admin1)도 기본 'robotics!'. ADMIN_PASSWORD 로 덮어쓸 수 있다.
const judgePasswords = (process.env.JUDGE_PASSWORDS ?? '').split(',').map((p) => p.trim());
const judges: Account[] = Array.from({ length: 5 }, (_, i) => ({
  id: `REF0${i + 1}`,
  password: judgePasswords[i] || 'robotics!',
  name: `심판 ${i + 1}`,
  role: 'judge' as const,
}));

// 로그인 가능한 계정 목록 (비밀번호가 비어 있는 계정은 제외)
export const demoUsers: readonly Account[] = [
  { id: 'user1', password: 'robotics!', name: '일반 참가자', role: 'user' as const },
  { id: 'judge1', password: 'robotics!', name: '심판', role: 'judge' as const },
  { id: 'admin1', password: process.env.ADMIN_PASSWORD || 'robotics!', name: '관리자', role: 'admin' as const },
  ...judges,
].filter((u) => u.password);

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
