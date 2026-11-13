'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import ConnectionToast from './ConnectionToast';
import { useRealtime, type Standing } from '@/lib/realtime/useRealtime';
import { teamName, useContest, withRanks, type RankedStanding, type Team } from '@/lib/contest';
import { CATEGORY_NAMES, type Category } from '@/lib/judge/rules';

// 시상대 위 카드: 1등 중앙, 2등 왼쪽, 3등 오른쪽 (위치는 시상대 이미지 기준 %)
const podium = [
  { left: '38.3%', top: '3.2%' },
  { left: '11.9%', top: '15.4%' },
  { left: '65.9%', top: '25%' },
] as const;

// 부문별 순위: 시니어/주니어는 각각 16팀이라 부문마다 따로 집계해서 보여준다
const CATEGORIES: Category[] = ['S', 'J'];
const PER_CATEGORY = 16;

// 개발 중에도 실제 집계된 점수만 보여준다. 점수가 없으면 빈 상태 안내를 띄운다.

// 이전 집계 대비 순위 변화: 양수면 상승, 음수면 하락
type Deltas = Record<string, number>;

// 점수가 바뀌면 이전 값에서 새 값까지 숫자가 부드럽게 올라가거나 내려간다
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      from.current = value;
      setShown(value);
      return;
    }
    const t0 = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const p = Math.min((now - t0) / 700, 1);
      const v = start + (value - start) * (1 - (1 - p) ** 3);
      from.current = v;
      setShown(p < 1 ? Math.round(v) : value);
      if (p < 1) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{shown}</>;
}

function Delta({ value }: { value?: number }) {
  if (!value) return <span className="text-sm font-medium text-gray-400">–</span>;
  const up = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-sm font-semibold tabular-nums ${up ? 'text-accent' : 'text-error'}`}>
      {up ? '▲' : '▼'}
      {Math.abs(value)}
    </span>
  );
}

function TeamLabel({ teams, team, delta }: { teams: Team[]; team?: Standing; delta?: number }) {
  return (
    <>
      <p className="truncate text-base font-semibold sm:text-2xl">{team ? teamName(teams, team.teamId) : '-'}</p>
      <p className="flex items-center justify-center gap-2 text-xs tabular-nums sm:text-lg">
        {team && (
          <>
            <CountUp value={team.total} />점 <Delta value={delta} />
          </>
        )}
      </p>
      {team && (
        <p className="truncate text-[10px] tabular-nums text-gray-400 sm:text-xs">
          1차 {team.r1 ?? '–'} · 2차 {team.r2 ?? '–'}
        </p>
      )}
    </>
  );
}

function Podium({ teams, ranked, deltas }: { teams: Team[]; ranked: RankedStanding[]; deltas: Deltas }) {
  return (
    <div className="relative mx-auto mt-16 aspect-[596/397] w-full max-w-[780px]">
      <Image src="/images/podium.png" alt="" fill sizes="780px" priority className="object-cover" />
      {/* 카드를 팀 기준으로 그려서, 순위가 바뀌면 다른 단으로 미끄러지듯 이동한다 */}
      {ranked.slice(0, 3).map((team, i) => {
        const { left, top } = podium[i];
        return (
          <div
            key={team.teamId}
            style={{ left, top }}
            className="rank-enter absolute w-[23.3%] min-w-[84px] overflow-hidden rounded-2xl border border-line bg-white px-2 py-1.5 text-center transition-[left,top] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none sm:px-[24px] sm:py-[14px]"
          >
            <p className="text-[11px] font-bold leading-tight text-accent sm:text-sm">
              {team.rank}
              {team.tied ? '=' : ''}
            </p>
            <TeamLabel teams={teams} team={team} delta={deltas[team.teamId]} />
          </div>
        );
      })}
    </div>
  );
}

// 행 높이 96px + 간격 8px
const ROW = 104;
// 8강 진출 컷 구분선 높이
const DIVIDER = 28;
const CUT = 8; // 부문 순위 상위 8팀이 8강 진출

function RankList({ teams, ranked, deltas }: { teams: Team[]; ranked: RankedStanding[]; deltas: Deltas }) {
  const rows = ranked.slice(3, PER_CATEGORY);
  const hasCut = ranked.length > CUT;
  const cutAfter = CUT - 4; // 컷 아래 첫 행의 rows 내 인덱스 (8위 = rows[4], 그 뒤부터 분리자만큼 밀림)
  return (
    <ol className="relative mx-auto mt-10 w-full max-w-[960px]" style={{ height: rows.length * ROW + (hasCut ? DIVIDER : 0) }}>
      {rows.map((s, i) => (
        <li
          key={s.teamId}
          style={{ transform: `translateY(${i * ROW + (hasCut && i > cutAfter ? DIVIDER : 0)}px)` }}
          className="rank-fade absolute inset-x-0 top-0 flex items-center gap-5 transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
        >
          <span className="w-[50px] shrink-0 text-[32px] font-semibold text-heading">
            {s.rank}
            {s.tied ? '=' : ''}
          </span>
          <div className="h-[96px] min-w-0 flex-1 overflow-hidden rounded-2xl border border-line bg-white px-[19px] py-[10px] sm:[&_p:first-child]:!text-xl sm:[&_p:nth-of-type(2)]:!text-base [&_p:nth-of-type(2)]:!justify-start">
            <TeamLabel teams={teams} team={s} delta={deltas[s.teamId]} />
          </div>
        </li>
      ))}
      {hasCut && (
        <li
          aria-hidden
          style={{ transform: `translateY(${(cutAfter + 1) * ROW - (ROW - 96) / 2}px)`, height: DIVIDER }}
          className="absolute inset-x-0 top-0 flex items-center"
        >
          <span className="h-px flex-1 bg-line" />
          <span className="px-3 text-xs font-semibold text-gray-400">8강 진출</span>
          <span className="h-px flex-1 bg-line" />
        </li>
      )}
    </ol>
  );
}

export default function RankingBoard({ switcher }: { switcher?: React.ReactNode }) {
  const { status, standings: live, standingsAt } = useRealtime();
  const { config } = useContest();
  const teams = config?.teams ?? [];
  const [cat, setCat] = useState<Category>('S');
  const standings = live.filter((t) => t.cat === cat);
  const ranked = withRanks(standings, cat);

  // 직전 집계의 순위를 기억해 두었다가 새 집계가 오면 변화량을 계산한다 (순위는 부문 안에서 센다)
  const prevRanks = useRef(new Map<string, number>());
  const [liveDeltas, setLiveDeltas] = useState<Deltas>({});
  useEffect(() => {
    if (live.length === 0) return;
    const rankedAll = CATEGORIES.flatMap((c) => withRanks(live, c).map((s) => [s.teamId, s.rank] as const));
    const prev = prevRanks.current;
    if (prev.size > 0 && rankedAll.some(([id, rank]) => prev.get(id) !== rank)) {
      setLiveDeltas(Object.fromEntries(rankedAll.map(([id, rank]) => [id, (prev.get(id) ?? rank) - rank])));
    }
    prevRanks.current = new Map(rankedAll);
  }, [live]);
  const deltas = liveDeltas;
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
            <Podium key={`podium-${cat}`} teams={teams} ranked={ranked} deltas={deltas} />
            <RankList key={`list-${cat}`} teams={teams} ranked={ranked} deltas={deltas} />
            {standingsAt && (
              <p className="mt-6 text-center text-xs text-gray-400">마지막 수신 {new Date(standingsAt).toLocaleTimeString('ko-KR')}</p>
            )}
          </>
        )}
      </div>
      <ConnectionToast status={status} />
    </section>
  );
}
