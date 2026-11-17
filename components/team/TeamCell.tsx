'use client';

import type { ReactNode } from 'react';
import TeamName from './TeamName';

// 탈락 연출(회색 + 연기). `.bracket-eliminated` 박스 안에 넣는다.
export function Smoke() {
  return (
    <span className="bracket-smoke" aria-hidden>
      <i /><i /><i />
    </span>
  );
}

// 박스 안의 팀 이름 + 보조 줄(점수 등). 대진표의 모든 팀 칸이 같은 모양을 쓴다.
export default function TeamCell({ teamId, sub, strong = false }: { teamId: string; sub?: ReactNode; strong?: boolean }) {
  return (
    <>
      <span className={strong ? 'w-full truncate text-center text-[1.4cqw] font-bold leading-tight text-heading' : 'line-clamp-2 text-center text-[1.4cqw] font-semibold leading-tight text-heading [word-break:keep-all]'}>
        <TeamName id={teamId} />
      </span>
      {sub !== undefined && sub !== null && <span className="text-[1.2cqw] text-gray-500">{sub}</span>}
    </>
  );
}
