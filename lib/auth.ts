import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { SESSION_COOKIE, verifySessionToken, type Role } from './session';

type Account = { id: string; password: string; name: string; role: Role };

const isProd = process.env.NODE_ENV === 'production';

// 심판 REF01~REF05. 운영에서는 비밀번호를 환경변수로만 받는다 (코드/저장소에 두지 않음).
//   JUDGE_PASSWORDS=pw01,pw02,pw03,pw04,pw05   (REF01 부터 순서대로)
//   ADMIN_PASSWORD=...                          (admin1)
// 값이 없는 계정은 운영에서 로그인할 수 없다. 개발에서는 기본 데모 비밀번호를 쓴다.
const judgePasswords = (process.env.JUDGE_PASSWORDS ?? '').split(',').map((p) => p.trim());
const judges: Account[] = Array.from({ length: 5 }, (_, i) => ({
  id: `REF0${i + 1}`,
  password: judgePasswords[i] || (isProd ? '' : 'ref1234'),
  name: `심판 ${i + 1}`,
  role: 'judge' as const,
}));

// 로그인 가능한 계정 목록 (비밀번호가 비어 있는 계정은 제외)
export const demoUsers: readonly Account[] = [
  ...(isProd ? [] : [
    { id: 'user1', password: 'user1234', name: '일반 참가자', role: 'user' as const },
    { id: 'judge1', password: 'judge1234', name: '심판', role: 'judge' as const },
  ]),
  { id: 'admin1', password: process.env.ADMIN_PASSWORD || (isProd ? '' : 'admin1234'), name: '관리자', role: 'admin' as const },
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
