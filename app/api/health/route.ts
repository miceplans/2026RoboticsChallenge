// 배포 후 헬스체크용 (proxy.ts 의 matcher 가 /api 를 제외하므로 인증 없이 응답)
export const dynamic = 'force-dynamic';

export function GET() {
  return new Response('ok');
}
