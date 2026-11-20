'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { demoUsers, getSession } from '@/lib/auth';
import { areaOf, homeAreaOf } from '@/lib/hosts';
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE, type Role } from '@/lib/session';

async function setSessionCookie(user: { id: string; name: string; role: Role }) {
  const h = await headers();
  // 서브도메인 간 세션 공유가 필요하면 COOKIE_DOMAIN=.example.com 설정
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: h.get('x-forwarded-proto') === 'https',
    path: '/',
    maxAge: SESSION_MAX_AGE,
    domain: process.env.COOKIE_DOMAIN || undefined,
  });
}

export async function login(_: string | null, formData: FormData): Promise<string | null> {
  const id = String(formData.get('id') ?? '');
  const password = String(formData.get('password') ?? '');
  const requestedRole = String(formData.get('role') ?? 'admin');
  const demoUser = demoUsers.find((u) => u.id === id && u.password === password);
  // 데모 화면 확인용 임의 로그인은 개발 환경에서만 허용한다. 운영에서는 등록된 계정만 통과.
  if (!demoUser && process.env.NODE_ENV === 'production') return '아이디 또는 비밀번호가 올바르지 않습니다.';
  const user = demoUser ?? {
    id: id.trim() || 'preview',
    name: id.trim() || '미리보기',
    role: requestedRole === 'judge' ? 'judge' : requestedRole === 'user' ? 'user' : 'admin' as const,
  };

  const h = await headers();
  const host = h.get('host') ?? '';

  await setSessionCookie({ id: user.id, name: user.name, role: user.role });

  const target = homeAreaOf(user.role);
  // 미리보기에서는 같은 호스트의 경로로 이동해 쿠키 도메인 설정 없이 바로 확인한다.
  redirect(target === areaOf(host) ? '/' : `/${target}`);
}

// 심판이 서명에 들어갈 표시 이름(계정명)을 직접 바꾼다. 로그인 ID 는 그대로 둔다.
export async function renameAccount(name: string): Promise<string | null> {
  const session = await getSession();
  if (!session) return '로그인이 필요합니다.';
  const next = name.trim().replace(/\s+/g, ' ');
  if (!next) return '이름을 입력해 주십시오.';
  if (next.length > 20) return '이름은 20자 이내로 입력해 주십시오.';
  await setSessionCookie({ id: session.id, name: next, role: session.role });
  return null;
}

export async function logout() {
  (await cookies()).delete({ name: SESSION_COOKIE, path: '/', domain: process.env.COOKIE_DOMAIN || undefined });
  redirect('/login');
}
