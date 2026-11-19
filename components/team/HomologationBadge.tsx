'use client';

import { useContest } from '@/lib/contest';

// 로봇 승인서 결과 표시: 승인 로봇 1대 이상 → 파란 체크, 한 대도 없음 → 빨간 X.
// 서버가 로그인한 참가자·심판·관리자에게 전 팀 결과를 내려주므로 여기서는 받은 값을 그린다.
export default function HomologationBadge({ teamId, status: given }: { teamId: string; status?: 'pass' | 'fail' | null }) {
  const { config } = useContest();
  const status = given === undefined ? config?.homologation?.[teamId] : given;
  if (!status) return null;
  const pass = status === 'pass';
  return (
    <svg
      viewBox="0 0 20 20"
      role="img"
      aria-label={pass ? '로봇 승인' : '로봇 승인 불가'}
      className={`ml-[0.25em] inline-block h-[1em] w-[1em] shrink-0 align-[-0.125em] ${pass ? 'text-accent' : 'text-error'}`}
    >
      <title>{pass ? '로봇 승인: 출전 가능' : '로봇 승인 불가: 승인된 로봇 없음'}</title>
      <circle cx="10" cy="10" r="10" fill="currentColor" />
      {pass ? (
        <path d="M5.5 10.4l3 3 6-6.4" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M6.6 6.6l6.8 6.8M13.4 6.6l-6.8 6.8" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      )}
    </svg>
  );
}
