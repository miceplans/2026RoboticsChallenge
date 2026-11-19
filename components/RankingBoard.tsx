'use client';

import { useState } from 'react';
import ConnectionToast from './ConnectionToast';
import Score from '@/components/team/Score';
import { useRealtime } from '@/lib/realtime/useRealtime';
import { useTeamScores } from '@/lib/scores';
import { type RankedStanding } from '@/lib/contest';
import { CATEGORY_NAMES, type Category } from '@/lib/judge/rules';

// 부문별 순위: 시니어/주니어는 각각 16팀이라 부문마다 따로 집계해서 보여준다.
// 명단의 모든 팀을 집계한다(점수가 없으면 0점). 명단이 비어 있으면 빈 상태 안내를 띄운다.
const CATEGORIES: Category[] = ['J', 'S'];
const PER_CATEGORY = 16;
const CUT = 8; // 부문 순위 상위 8팀이 8강 진출

// 전체 순위를 같은 카드로 표시한다. 왼쪽에는 큰 순위 숫자(워터마크), 오른쪽에는 점수를 둔다.
function RankList({ ranked }: { ranked: RankedStanding[] }) {
  const rows = ranked.slice(0, PER_CATEGORY);
  return (
    <ol className="mx-auto mt-10 flex w-full max-w-[660px] flex-col gap-3">
      {rows.map((s, i) => (
        <li key={s.teamId} className="contents">
          {/* 8위와 9위 사이 8강 진출 컷 */}
          {i + 1 === CUT + 1 && (
            <div aria-hidden className="flex items-center">
              <span className="h-px flex-1 bg-line" />
              <span className="px-3 text-xs font-semibold text-gray-400">8강 진출</span>
              <span className="h-px flex-1 bg-line" />
            </div>
          )}
          <div className="relative min-h-[72px] shrink-0 overflow-hidden rounded-xl bg-white/80 shadow-[4px_4px_20px_0_rgba(0,0,0,0.25)]">
            <span className="absolute -top-[32px] -left-[18px] whitespace-nowrap text-[113.895px] font-bold leading-[normal] text-[#ebebf1]">{s.rank}</span>
            <Score value={s.total} className="absolute top-1/2 right-5 -translate-y-1/2 text-xl font-bold text-black" />
            <div className="relative py-[13px] pr-24 pl-[80px] text-black">
              <p className="break-keep text-xl font-semibold leading-[normal]">{s.teamName || '팀 이름 불러오는 중…'}</p>
              <p className="break-keep text-base leading-[normal]">{s.teamOrg || '소속 학교 미등록'}</p>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function RankingBoard({ switcher }: { switcher?: React.ReactNode }) {
  const { status } = useRealtime();
  const { ranked: rankedOf } = useTeamScores();
  const [cat, setCat] = useState<Category>('J');
  const ranked = rankedOf(cat);
  const standings = ranked;

  return (
    <section className="relative min-h-screen overflow-hidden bg-white pt-[73px] pb-24 font-sans">
      <div className="relative mx-auto max-w-[1280px] px-6 pt-12">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-extrabold text-heading [word-break:keep-all]">대회 진행</h1>
          {switcher}
        </div>
        <nav className="flex gap-2 border-b border-line">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`px-4 py-3 text-base font-bold ${cat === c ? 'border-b-2 border-accent text-accent' : 'text-gray-500'}`}
            >
              {CATEGORY_NAMES[c]}
            </button>
          ))}
        </nav>
        {standings.length === 0 ? (
          <p className="mt-24 text-center text-gray-500">아직 집계된 {CATEGORY_NAMES[cat]} 점수가 없습니다.</p>
        ) : (
          <RankList key={`list-${cat}`} ranked={ranked} />
        )}
      </div>
      <ConnectionToast status={status} />
    </section>
  );
}
