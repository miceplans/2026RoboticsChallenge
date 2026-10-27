import { NextResponse, type NextRequest } from 'next/server';
import { areaOf, areaRoles } from '@/lib/hosts';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session';

// 로그인/로그아웃은 모든 호스트에서 공통으로 사용
const shared = ['/login'];
const isShared = (path: string) => shared.some((p) => path === p || path.startsWith(`${p}/`));

export async function proxy(request: NextRequest) {
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
  // 리라이트는 내부 경로만 바꾼다 (host 를 바꾸면 외부 프록시로 처리됨)
  const rewriteTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    return NextResponse.rewrite(url);
  };
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (area === 'main') {
    // 메인 호스트에서 /judge, /admin 직접 접근 차단
    if (/^\/(judge|admin)(\/|$)/.test(pathname)) return rewriteTo('/404');
    if (pathname.startsWith('/mypage') && !session) return redirectTo('/login');
    return NextResponse.next();
  }

  if (isShared(pathname)) return NextResponse.next();

  if (!session) return redirectTo('/login');
  // 권한 없는 역할은 존재 자체를 숨긴다
  if (!areaRoles[area].includes(session.role)) return rewriteTo('/404');

  const url = request.nextUrl.clone();
  url.pathname = `/${area}${pathname === '/' ? '' : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ['/((?!_next/|api/|.*\\..*).*)'],
};
