'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { demoUsers } from '@/lib/auth';
import { areaOf, homeAreaOf } from '@/lib/hosts';
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/session';

export async function login(_: string | null, formData: FormData): Promise<string | null> {
  const id = String(formData.get('id') ?? '');
  const password = String(formData.get('password') ?? '');
  const requestedRole = String(formData.get('role') ?? 'admin');
  const demoUser = demoUsers.find((u) => u.id === id && u.password === password);
  // 데모 화면 확인용: 지정된 데모 계정이 아니어도 어떤 값이든 로그인할 수 있다.
  const user = demoUser ?? {
    id: id.trim() || 'preview',
    name: id.trim() || '미리보기',
    role: requestedRole === 'judge' ? 'judge' : requestedRole === 'user' ? 'user' : 'admin' as const,
  };

  const h = await headers();
  const host = h.get('host') ?? '';

  // 서브도메인 간 세션 공유가 필요하면 COOKIE_DOMAIN=.example.com 설정
  (await cookies()).set(SESSION_COOKIE, await createSessionToken({ id: user.id, name: user.name, role: user.role }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: h.get('x-forwarded-proto') === 'https',
    path: '/',
    maxAge: SESSION_MAX_AGE,
    domain: process.env.COOKIE_DOMAIN || undefined,
  });

  const target = homeAreaOf(user.role);
  // 미리보기에서는 같은 호스트의 경로로 이동해 쿠키 도메인 설정 없이 바로 확인한다.
  redirect(target === areaOf(host) ? '/' : `/${target}`);
}

export async function logout() {
  (await cookies()).delete({ name: SESSION_COOKIE, path: '/', domain: process.env.COOKIE_DOMAIN || undefined });
  redirect('/login');
}
