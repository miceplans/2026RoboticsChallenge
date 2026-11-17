import { NextResponse, type NextRequest } from 'next/server';
import { areaOf, areaRoles } from '@/lib/hosts';
import { secureCookie } from '@/lib/cookie';
import { createSessionToken, needsRefresh, SESSION_COOKIE, SESSION_MAX_AGE, verifySessionToken } from '@/lib/session';

// 로그인/로그아웃/비밀번호 변경은 모든 호스트에서 공통으로 사용
const shared = ['/login', '/signup', '/judge/login', '/admin/login', '/password'];
const isShared = (path: string) => shared.some((p) => path === p || path.startsWith(`${p}/`));

// 활동 중인 사용자의 세션 만료를 늘인다. 서명·만료만 확인하므로, DB 에서 폐기된 세션(tv 불일치)은
// 쿠키만 연장될 뿐 getSession() 의 서버 대조에서 계속 거부된다.
export async function proxy(request: NextRequest) {
  const response = await route(request);
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (session && needsRefresh(session)) {
    const { id, name, role, teamId, tv, mc } = session;
    response.cookies.set(SESSION_COOKIE, await createSessionToken({ id, name, role, teamId, tv, mc }), {
      httpOnly: true,
      sameSite: 'lax',
      secure: secureCookie(request.headers.get('x-forwarded-proto')),
      path: '/',
      maxAge: SESSION_MAX_AGE,
      domain: process.env.COOKIE_DOMAIN || undefined,
    });
  }
  return response;
}

async function route(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get('host') ?? '';
  const area = areaOf(host);
  // 리다이렉트는 서브도메인을 유지해야 하므로 요청 Host 기준으로 URL 생성
  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.host = host;
    url.pathname = path;
    return NextResponse.redirect(url);
  };
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (area === 'main') {
    // 메인 호스트에서는 /judge·/admin 직접 진입을 허용한다 — 페이지의 requireRole 이 로그인·역할을 다시 검증한다.
    if ((pathname.startsWith('/mypage') || pathname.startsWith('/password')) && !session) return redirectTo('/login');
    return NextResponse.next();
  }

  if (isShared(pathname)) return NextResponse.next();

  if (!session) return redirectTo('/login');
  // 권한 없는 역할은 존재 자체를 숨긴다
  if (!areaRoles[area].includes(session.role)) return NextResponse.rewrite(new URL('/404', request.nextUrl));

  // 영역 서브도메인에서는 루트(/)가 영역 페이지다. 직접 /judge·/admin 접두사로 들어오는
  // 요청도 같은 페이지로 처리하고, 접두사가 중복된 주소(/judge/judge 등)는 접두사를 벗겨 복구한다.
  const areaPrefix = `/${area}`;
  let areaPath = pathname;
  while (areaPath === areaPrefix || areaPath.startsWith(`${areaPrefix}/`)) {
    areaPath = areaPath.slice(areaPrefix.length) || '/';
  }
  // 리라이트는 내부 경로만 바꾼다 (host 를 바꾸면 외부 프록시로 처리됨)
  const url = request.nextUrl.clone();
  url.pathname = `${areaPrefix}${areaPath === '/' ? '' : areaPath}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ['/((?!_next/|api/|.*\\..*).*)'],
};
