'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { areaOf, homeAreaOf } from '@/lib/hosts';
import { recordAttempt, recordFail, throttle } from '@/lib/rate-limit';
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/session';
import { touchLogin, verifyUser } from '@/lib/users';

type LoginArea = 'judge' | 'admin';

// 관리자가 발급한 계정(심판·관리자) 또는 본선 명단 기반으로 직접 가입한 계정으로 로그인한다.
// 비밀번호 검증은 모두 contest.db 해시 비교다 (lib/users.ts).
// 틀린 시도가 잦으면 일정 시간 차단한다 — 임시 비밀번호가 짧아 무차별 대입에 약하기 때문.
export async function login(_: string | null, formData: FormData): Promise<string | null> {
  const id = String(formData.get('id') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const areaValue = String(formData.get('area') ?? '');
  const requestedArea: LoginArea | '' = areaValue === 'judge' || areaValue === 'admin' ? areaValue : '';

  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  const key = `login:${ip}:${id.toLowerCase()}`;
  const gate = throttle(key, 5, 10 * 60_000, 10 * 60_000);
  if (!gate.ok) return `로그인 시도가 너무 많습니다. ${Math.ceil(gate.retryAfterSec / 60)}분 후에 다시 시도해 주세요.`;
  recordAttempt(key, 10 * 60_000);

  const user = await verifyUser(id, password);
  if (!user) {
    recordFail(key);
    return '아이디 또는 비밀번호가 올바르지 않습니다.';
  }

  if (requestedArea === 'judge' && user.role !== 'judge' && user.role !== 'admin') {
    return '심판 계정으로 로그인해 주세요.';
  }
  if (requestedArea === 'admin' && user.role !== 'admin') {
    return '관리자 계정으로 로그인해 주세요.';
  }

  touchLogin(user.id);

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
