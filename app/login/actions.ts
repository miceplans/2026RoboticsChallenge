'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { demoUsers } from '@/lib/auth';
import { areaOf, homeAreaOf } from '@/lib/hosts';
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/session';
import { verifyRegisteredUser } from '@/lib/users';

type LoginArea = 'judge' | 'admin';

// 발급받은 데모 계정(demoUsers) 또는 본선 명단 기반으로 직접 가입한 계정으로 로그인한다.
export async function login(_: string | null, formData: FormData): Promise<string | null> {
  const id = String(formData.get('id') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const areaValue = String(formData.get('area') ?? '');
  const requestedArea: LoginArea | '' = areaValue === 'judge' || areaValue === 'admin' ? areaValue : '';

  const demo = demoUsers.find((u) => u.id === id && u.password === password);
  const registered = demo ? null : verifyRegisteredUser(id, password);
  if (!demo && !registered) return '아이디 또는 비밀번호가 올바르지 않습니다.';

  const user = demo ?? { id: registered!.id, name: registered!.name, role: 'user' as const, teamId: registered!.teamId };

  if (requestedArea === 'judge' && user.role !== 'judge' && user.role !== 'admin') {
    return '심판 계정으로 로그인해 주세요.';
  }
  if (requestedArea === 'admin' && user.role !== 'admin') {
    return '관리자 계정으로 로그인해 주세요.';
  }

  const h = await headers();
  const host = h.get('host') ?? '';

  // 서브도메인 간 세션 공유가 필요하면 COOKIE_DOMAIN=.example.com 설정
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: h.get('x-forwarded-proto') === 'https',
    path: '/',
    maxAge: SESSION_MAX_AGE,
    domain: process.env.COOKIE_DOMAIN || undefined,
  });

  const target = requestedArea || homeAreaOf(user.role);
  redirect(target === areaOf(host) ? '/' : `/${target}`);
}

export async function logout() {
  (await cookies()).delete({ name: SESSION_COOKIE, path: '/', domain: process.env.COOKIE_DOMAIN || undefined });
  redirect('/login');
}
