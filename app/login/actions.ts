'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { areaOf, homeAreaOf } from '@/lib/hosts';
import { apiLogin } from '@/lib/auth-api';
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/session';

type LoginArea = 'judge' | 'admin';

// 비밀번호 검증과 시도 제한은 계정 DB 를 가진 실시간 서버가 맡는다 (lib/auth-api.ts).
// 웹이 Vercel 처럼 DB 가 없는 호스트에서 돌아도 동작하게 하기 위함이다.
export async function login(_: string | null, formData: FormData): Promise<string | null> {
  const id = String(formData.get('id') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const areaValue = String(formData.get('area') ?? '');
  const requestedArea: LoginArea | '' = areaValue === 'judge' || areaValue === 'admin' ? areaValue : '';

  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  const result = await apiLogin(id, password, ip);
  if (!result.ok) {
    if (result.error === 'throttled') return `로그인 시도가 너무 많습니다. ${Math.ceil((result.retryAfterSec ?? 600) / 60)}분 후에 다시 시도해 주세요.`;
    if (result.error === 'unavailable') return '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.';
    return '아이디 또는 비밀번호가 올바르지 않습니다.';
  }
  const user = result.user;

  if (requestedArea === 'judge' && user.role !== 'judge' && user.role !== 'admin') {
    return '심판 계정으로 로그인해 주세요.';
  }
  if (requestedArea === 'admin' && user.role !== 'admin') {
    return '관리자 계정으로 로그인해 주세요.';
  }

  // tv(token_version)를 함께 서명한다 — 비밀번호 재발급·강등 시 기존 세션이 무효화된다.
  (await cookies()).set(SESSION_COOKIE, await createSessionToken({ id: user.id, name: user.name, role: user.role, teamId: user.teamId, tv: user.tv }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: h.get('x-forwarded-proto') === 'https',
    path: '/',
    maxAge: SESSION_MAX_AGE,
    domain: process.env.COOKIE_DOMAIN || undefined,
  });

  const host = h.get('host') ?? '';
  const target = requestedArea || homeAreaOf(user.role);
  redirect(target === areaOf(host) ? '/' : `/${target}`);
}

export async function logout() {
  (await cookies()).delete({ name: SESSION_COOKIE, path: '/', domain: process.env.COOKIE_DOMAIN || undefined });
  redirect('/login');
}
