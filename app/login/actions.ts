'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { demoUsers } from '@/lib/auth';
import { areaOf, homeAreaOf, hostFor } from '@/lib/hosts';
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/session';

export async function login(_: string | null, formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const password = String(formData.get('password') ?? '');
  const user = demoUsers.find((u) => u.id === id && u.password === password);
  if (!user) return '아이디 또는 비밀번호가 올바르지 않습니다.';

  const h = await headers();
  const host = h.get('host') ?? '';
  const proto = h.get('x-forwarded-proto') ?? 'http';

  // 서브도메인 간 세션 공유가 필요하면 COOKIE_DOMAIN=.example.com 설정
  (await cookies()).set(SESSION_COOKIE, await createSessionToken({ id: user.id, name: user.name, role: user.role }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: proto === 'https',
    path: '/',
    maxAge: SESSION_MAX_AGE,
    domain: process.env.COOKIE_DOMAIN || undefined,
  });

  const target = homeAreaOf(user.role);
  // 같은 호스트면 상대 경로, 다르면 해당 서브도메인으로 이동 (쿠키 공유 필요)
  redirect(target === areaOf(host) ? '/' : `${proto}://${hostFor(target, host)}/`);
}

export async function logout() {
  (await cookies()).delete({ name: SESSION_COOKIE, path: '/', domain: process.env.COOKIE_DOMAIN || undefined });
  redirect('/login');
}
