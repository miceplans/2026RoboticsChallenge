'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { findTeamByName } from '@/lib/contest-db';
import { areaOf, homeAreaOf } from '@/lib/hosts';
import { throttle } from '@/lib/rate-limit';
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/session';
import { findAnyUser, findTeamMemberUser, registerUser } from '@/lib/users';

// 참가자 본인 확인: contest.db teams(본선 명단)의 팀 이름+참가자 이름과
// 정확히 일치하는 경우에만 가입할 수 있고, 가입한 계정은 해당 팀에 연결된다.
export async function signup(_: string | null, formData: FormData): Promise<string | null> {
  const teamName = String(formData.get('teamName') ?? '').trim();
  const memberName = String(formData.get('memberName') ?? '').trim();
  const id = String(formData.get('id') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!teamName || !memberName) return '팀 이름과 참가자 이름을 입력해 주세요.';
  if (!/^[a-zA-Z0-9._-]{4,32}$/.test(id)) return '아이디는 4~32자의 영문, 숫자, . _ - 만 사용할 수 있습니다.';
  if (password.length < 6 || password.length > 64) return '비밀번호는 6~64자로 입력해 주세요.';

  const h0 = await headers();
  const ip0 = h0.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  const gate = throttle(`signup:${ip0}`, 20, 3600_000, 3600_000);
  if (!gate.ok) return `가입 시도가 너무 많습니다. ${Math.ceil(gate.retryAfterSec / 60)}분 후에 다시 시도해 주세요.`;

  const team = findTeamByName(teamName);
  if (!team) return '본선 참가 명단에 등록되지 않은 팀 이름입니다. 명단과 정확히 같게 입력해 주세요.';
  if (!team.members.includes(memberName)) return `${team.name} 팀 명단에 없는 참가자 이름입니다.`;

  if (findAnyUser(id)) return '이미 사용 중인 아이디입니다.';
  if (findTeamMemberUser(team.id, memberName)) return '이미 가입된 참가자입니다. 로그인을 이용해 주세요.';

  await registerUser({ id, name: memberName, teamId: team.id, password });

  const h = await headers();
  (await cookies()).set(SESSION_COOKIE, await createSessionToken({ id, name: memberName, role: 'user', teamId: team.id }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: h.get('x-forwarded-proto') === 'https',
    path: '/',
    maxAge: SESSION_MAX_AGE,
    domain: process.env.COOKIE_DOMAIN || undefined,
  });

  const target = homeAreaOf('user');
  const host = h.get('host') ?? '';
  redirect(target === areaOf(host) ? '/mypage' : `/${target}`);
}
