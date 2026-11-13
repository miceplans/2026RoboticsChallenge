import { NextResponse, type NextRequest } from 'next/server';
import { areaOf, areaRoles } from '@/lib/hosts';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session';

// 로그인/로그아웃은 모든 호스트에서 공통으로 사용
const shared = ['/login', '/signup', '/judge/login', '/admin/login', '/password'];
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
    // 개발 환경과 일반 URL에서는 /judge, /admin 직접 진입을 허용한다.
    // 이전에는 이 경로를 /404로 리라이트해서, 실제 페이지가 있어도
    // localhost:3000/judge 접근이 항상 실패했다. 페이지의 requireRole이
    // 로그인 및 역할 권한은 계속 검증한다.
    if ((pathname.startsWith('/mypage') || pathname.startsWith('/password')) && !session) return redirectTo('/login');
    return NextResponse.next();
  }

  // 운영 서브도메인의 대표 로그인 주소는 해당 운영 영역 로그인으로 연결한다.
  // 예: admin.example.com/login → admin.example.com/admin/login
  // 공용 로그인 페이지를 보여주면 관리자 계정으로 로그인할 수 없는 것처럼
  // 보이기 때문에, 사용자가 자연스럽게 입력하는 주소도 지원한다.
  if (pathname === '/login') return redirectTo(`/${area}/login`);

  if (isShared(pathname)) return NextResponse.next();

  if (!session) return redirectTo('/login');
  // 권한 없는 역할은 존재 자체를 숨긴다
  if (!areaRoles[area].includes(session.role)) return rewriteTo('/404');

  // 영역 서브도메인은 브라우저 주소에서 루트(`/`)를 쓰지만,
  // 직접 `/judge` 또는 `/admin`으로 들어오는 경우도 같은 페이지로
  // 처리한다. 접두사를 이미 포함한 요청에 다시 붙이면 `/judge/judge`
  // 같은 존재하지 않는 경로로 rewrite 되어 404가 된다.
  const areaPrefix = `/${area}`;
  let areaPath = pathname;
  // 이전에 생성된 `/judge/judge`·`/admin/admin` 링크도 정상 경로로
  // 복구해, 브라우저가 잘못된 주소를 계속 재요청하지 않게 한다.
  while (areaPath === areaPrefix || areaPath.startsWith(`${areaPrefix}/`)) {
    areaPath = areaPath.slice(areaPrefix.length) || '/';
  }
  const url = request.nextUrl.clone();
  url.pathname = `${areaPrefix}${areaPath === '/' ? '' : areaPath}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ['/((?!_next/|api/|.*\\..*).*)'],
};
