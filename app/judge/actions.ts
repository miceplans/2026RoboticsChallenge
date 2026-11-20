'use server';

import { cookies, headers } from 'next/headers';
import { getSession } from '@/lib/auth';
import { apiRenameAccount } from '@/lib/auth-api';
import { secureCookie } from '@/lib/cookie';
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/session';

// 심판이 서명에 들어갈 본인 이름을 직접 바꾼다. 성공하면 null, 실패하면 사유를 돌려준다.
export async function renameMyAccount(name: string): Promise<string | null> {
  const session = await getSession();
  if (!session || session.role !== 'judge') return '심판 로그인이 필요합니다.';
  const next = name.replace(/\s+/g, ' ').trim();
  if (!next) return '이름을 입력해 주세요.';
  if (next.length > 20) return '이름은 20자 이내로 입력해 주세요.';

  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? '';
  const result = await apiRenameAccount(token, next);
  if (!result.ok) return result.error === 'unavailable' ? '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.' : '이름을 바꾸지 못했습니다.';

  const h = await headers();
  (await cookies()).set(SESSION_COOKIE, await createSessionToken({ id: session.id, name: result.name, role: session.role, teamId: session.teamId, tv: session.tv }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookie(h.get('x-forwarded-proto')),
    path: '/',
    maxAge: SESSION_MAX_AGE,
    domain: process.env.COOKIE_DOMAIN || undefined,
  });
  return null;
}
