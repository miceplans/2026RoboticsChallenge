'use client';

import Image from 'next/image';
import { useState, type CSSProperties } from 'react';
import ConnectionToast from './ConnectionToast';
import { useRealtime } from '@/lib/realtime/useRealtime';
import { teamName, useContest, withRanks, type RankedStanding, type Team } from '@/lib/contest';
import { CATEGORY_NAMES, type Category } from '@/lib/judge/rules';

// 부문별 순위: 시니어/주니어는 각각 16팀이라 부문마다 따로 집계해서 보여준다.
// 명단의 모든 팀을 집계한다(점수가 없으면 0점). 명단이 비어 있으면 빈 상태 안내를 띄운다.
const CATEGORIES: Category[] = ['S', 'J'];
const PER_CATEGORY = 16;
const CUT = 8; // 부문 순위 상위 8팀이 8강 진출

function memberLine(teams: Team[], id: string) {
  const members = teams.find((t) => t.id === id)?.members ?? [];
  return members.filter(Boolean).join(', ');
}

// 시상대 카드 (Figma 113:227): 시상대 그룹 507 x 295.5 기준 %, 글자는 컨테이너 너비 기준 cqw
// 1등 중앙(금빛), 2등 왼쪽(흰빛), 3등 오른쪽(주황빛)
const podium = [
  { left: '35.1%', top: '0%', width: '27.4%', px: '3.75cqw', py: '2.76cqw', radius: '2.37cqw', name: '3.95cqw', sub: '3.16cqw', shadow: '0 -4px 50px 0 #d5a73a' },
  { left: '8.09%', top: '24.03%', width: '22.01%', px: '3.01cqw', py: '2.22cqw', radius: '1.9cqw', name: '3.17cqw', sub: '2.53cqw', shadow: '0 -3.211px 40.141px 0 #fff' },
  { left: '67.65%', top: '36.89%', width: '20.51%', px: '2.8cqw', py: '2.07cqw', radius: '1.77cqw', name: '2.95cqw', sub: '2.36cqw', shadow: '0 -2.993px 37.41px 0 rgba(209,91,0,0.5)' },
] as const;

function Podium({ teams, ranked }: { teams: Team[]; ranked: RankedStanding[] }) {
  return (
    <div className="mx-auto mt-10 w-full max-w-[560px] [container-type:inline-size]">
      <div className="relative w-full" style={{ aspectRatio: '507 / 295.5' }}>
        <div className="absolute inset-x-0 bottom-0" style={{ height: `${(253.5 / 295.5) * 100}%` }}>
          <Image src="/images/podium-figma.png" alt="" fill sizes="560px" priority className="object-cover" />
        </div>
        {ranked.slice(0, 3).map((team, i) => {
          const p = podium[i];
          const style: CSSProperties = {
            left: p.left,
            top: p.top,
            width: p.width,
            padding: `${p.py} ${p.px}`,
            borderRadius: p.radius,
            boxShadow: p.shadow,
          };
          return (
            <div key={team.teamId} style={style} className="absolute overflow-hidden bg-white text-center text-black">
              <p className="break-keep font-semibold leading-[normal]" style={{ fontSize: p.name }}>
                {teamName(teams, team.teamId)}
              </p>
              <p className="break-keep leading-[normal]" style={{ fontSize: p.sub }}>
                {memberLine(teams, team.teamId)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 4위 이하: 높이 72px 카드, 왼쪽에 큰 순위 숫자(워터마크), 팀명과 팀원
function RankList({ teams, ranked }: { teams: Team[]; ranked: RankedStanding[] }) {
  const rows = ranked.slice(3, PER_CATEGORY);
  return (
    <ol className="mx-auto mt-[15px] flex w-full max-w-[660px] flex-col gap-3">
      {rows.map((s, i) => (
        <li key={s.teamId} className="contents">
          {/* 8위와 9위 사이 8강 진출 컷 */}
          {i + 4 === CUT + 1 && (
            <div aria-hidden className="flex items-center">
              <span className="h-px flex-1 bg-line" />
              <span className="px-3 text-xs font-semibold text-gray-400">8강 진출</span>
              <span className="h-px flex-1 bg-line" />
            </div>
          )}
          <div className="relative min-h-[72px] shrink-0 overflow-hidden rounded-xl bg-white/80 shadow-[4px_4px_20px_0_rgba(0,0,0,0.25)]">
            <span className="absolute -top-[32px] -left-[18px] whitespace-nowrap text-[113.895px] font-bold leading-[normal] text-[#ebebf1]">{i + 4}</span>
            <div className="relative py-[13px] pr-4 pl-[80px] text-black">
              <p className="break-keep text-xl font-semibold leading-[normal]">{teamName(teams, s.teamId)}</p>
              <p className="break-keep text-base leading-[normal]">{memberLine(teams, s.teamId)}</p>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function RankingBoard({ switcher }: { switcher?: React.ReactNode }) {
  const { status, standings: live } = useRealtime();
  const { config } = useContest();
  const teams = config?.teams ?? [];
  const [cat, setCat] = useState<Category>('S');
  const standings = live.filter((t) => t.cat === cat);
  const ranked = withRanks(standings, cat);

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
          <>
            <Podium key={`podium-${cat}`} teams={teams} ranked={ranked} />
            <RankList key={`list-${cat}`} teams={teams} ranked={ranked} />
          </>
        )}
      </div>
      <ConnectionToast status={status} />
    </section>
  );
}
