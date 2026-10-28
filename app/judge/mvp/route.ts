import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';

// 디자인·기능 기준으로 전달받은 MVP 원본을 개발 미리보기에서 그대로 제공한다.
// 별도 프레임워크 재구현 과정에서 화면/동작이 달라지는 것을 방지한다.
const source = '/Users/hwangjiyeong/Downloads/로보틱스_문제해결_심하히스템_MVP.html';

export async function GET() {
  try {
    return new NextResponse(await readFile(source, 'utf8'), {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  } catch {
    return new NextResponse('참고 MVP 파일을 찾을 수 없습니다.', { status: 404 });
  }
}
