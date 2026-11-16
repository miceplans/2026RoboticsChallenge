import { cookies, headers } from 'next/headers';
import { secureCookie } from '@/lib/cookie';
import { createSessionToken, needsRefresh, SESSION_COOKIE, SESSION_MAX_AGE, verifySessionToken } from '@/lib/session';

// 실시간 소켓/API 통신만 계속하는 화면도 세션을 연장할 수 있게 한다.
// 쿠키는 HttpOnly라 브라우저가 토큰을 읽거나 갱신할 수 없고, 이 same-origin
// 엔드포인트가 서명·만료를 검증한 뒤에만 새 쿠키를 내려준다.
export const dynamic = 'force-dynamic';

export async function POST() {
  const cookieStore = await cookies();
  const session = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session || !needsRefresh(session)) return new Response(null, { status: 204 });

  const forwardedProto = (await headers()).get('x-forwarded-proto')?.split(',')[0]?.trim();
  const { id, name, role, teamId, tv, mc } = session;
  // mc(변경 필요)는 비밀번호를 바꿀 때까지 유지한다 — 갱신으로 강제가 빠져나가지 않게.
  cookieStore.set(SESSION_COOKIE, await createSessionToken({ id, name, role, teamId, tv, mc }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookie(forwardedProto),
    path: '/',
    maxAge: SESSION_MAX_AGE,
    domain: process.env.COOKIE_DOMAIN || undefined,
  });
  return new Response(null, { status: 204 });
}
