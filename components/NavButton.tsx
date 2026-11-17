'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

// 버튼처럼 보이는 페이지 이동 요소를 실제 <button>으로 렌더링한다.
export default function NavButton({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <button type="button" className={className} onClick={() => router.push(href)}>
      {children}
    </button>
  );
}
