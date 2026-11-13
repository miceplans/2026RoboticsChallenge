'use server';

import { cookies, headers } from 'next/headers';
import { getSession } from '@/lib/auth';
import { recordAttempt, recordFail, throttle } from '@/lib/rate-limit';
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/session';
import { changePassword, verifyUser } from '@/lib/users';

// 로그인한 본인의 비밀번호 변경 (참가자·심판·관리자 공통). 성공 메시지는 'ok' 로 돌려준다.
export async function changeMyPassword(_: string | null, formData: FormData): Promise<string | null> {
  const session = await getSession();
  if (!session) return '로그인이 필요합니다.';
  const current = String(formData.get('current') ?? '');
  const next = String(formData.get('next') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  if (next.length < 8) return '새 비밀번호는 8자 이상이어야 합니다.';
  if (next !== confirm) return '새 비밀번호가 서로 다릅니다.';
  if (next === current) return '현재 비밀번호와 다른 비밀번호를 입력해 주세요.';

  const h = await headers();
  const key = `pwchange:${session.id}`;
  const gate = throttle(key, 5, 10 * 60_000, 10 * 60_000);
  if (!gate.ok) return `시도가 너무 많습니다. ${Math.ceil(gate.retryAfterSec / 60)}분 후에 다시 시도해 주세요.`;
  recordAttempt(key, 10 * 60_000);

  if (!(await verifyUser(session.id, current))) {
    recordFail(key);
    return '현재 비밀번호가 올바르지 않습니다.';
  }

  const tv = await changePassword(session.id, next);
  (await cookies()).set(SESSION_COOKIE, await createSessionToken({ id: session.id, name: session.name, role: session.role, teamId: session.teamId, tv }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: h.get('x-forwarded-proto') === 'https',
    path: '/',
    maxAge: SESSION_MAX_AGE,
    domain: process.env.COOKIE_DOMAIN || undefined,
  });
  return 'ok';
}
