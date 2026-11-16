// 세션 쿠키의 secure 플래그를 정한다.
// 기본은 신뢰 프록시가 남기는 x-forwarded-proto 이고, 프록시 없이 직접 노출된 배포에서는
// 그 헤더가 위조될 수 있으니 COOKIE_SECURE=true 로 고정해 무조건 secure 를 켠다.
export const secureCookie = (forwardedProto: string | null | undefined): boolean =>
  process.env.COOKIE_SECURE === 'true' || forwardedProto === 'https';
