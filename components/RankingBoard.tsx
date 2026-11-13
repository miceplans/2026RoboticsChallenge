'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import ConnectionToast from './ConnectionToast';
import { useRealtime, type Standing } from '@/lib/realtime/useRealtime';
import { teamName, useContest, type Team } from '@/lib/contest';
import { CATEGORY_NAMES, type Category } from '@/lib/judge/rules';

// 시상대 위 카드: 1등이 가운데, 2등 왼쪽, 3등 오른쪽 (위치는 시상대 이미지 기준 %)
const podium = [
  { left: '38.3%', top: '4.5%' },
  { left: '11.9%', top: '16.6%' },
  { left: '65.9%', top: '26.2%' },
] as const;

// 부문별 순위: 시니어/주니어는 각각 16팀이라 부문마다 따로 집계해서 보여준다
const CATEGORIES: Category[] = ['S', 'J'];
const PER_CATEGORY = 16;

// 개발 중 디자인 확인용 목데이터: 실제 점수가 없을 때만, 프로덕션이 아닐 때만 쓴다 (팀 명단은 서버에서 받는다)
const useMock = process.env.NODE_ENV !== 'production';

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
    </>
  );
}

function Podium({ teams, standings, deltas }: { teams: Team[]; standings: Standing[]; deltas: Deltas }) {
  return (
    <div className="relative mx-auto mt-16 aspect-[596/397] w-full max-w-[780px]">
      <Image src="/images/podium.png" alt="" fill sizes="780px" priority className="object-cover" />
      {/* 카드를 팀 기준으로 그려서, 순위가 바뀌면 다른 단으로 미끄러지듯 이동한다 */}
      {standings.slice(0, 3).map((team, i) => {
        const { left, top } = podium[i];
        return (
          <div
            key={team.teamId}
            style={{ left, top }}
            className="rank-enter absolute w-[23.3%] min-w-[84px] overflow-hidden rounded-2xl border border-line bg-white px-2 py-2 text-center transition-[left,top] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none sm:px-[24px] sm:py-[18px]"
          >
            <TeamLabel teams={teams} team={team} delta={deltas[team.teamId]} />
          </div>
        );
      })}
    </div>
  );
}

// 행 높이 72px + 간격 8px
const ROW = 80;

function RankList({ teams, standings, deltas }: { teams: Team[]; standings: Standing[]; deltas: Deltas }) {
  const rows = standings.slice(3, PER_CATEGORY);
  return (
    <ol className="relative mx-auto mt-10 w-full max-w-[960px]" style={{ height: rows.length * ROW }}>
      {rows.map((s, i) => (
        <li
          key={s.teamId}
          style={{ transform: `translateY(${i * ROW}px)` }}
          className="rank-fade absolute inset-x-0 top-0 flex items-center gap-5 transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
        >
          <span className="w-[50px] shrink-0 text-[32px] font-semibold text-heading">{i + 4}</span>
          <div className="h-[72px] min-w-0 flex-1 overflow-hidden rounded-2xl border border-line bg-white px-[19px] py-[14px] sm:[&_p:first-child]:!text-xl sm:[&_p:last-child]:!text-base [&_p:last-child]:!justify-start">
            <TeamLabel teams={teams} team={s} delta={deltas[s.teamId]} />
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function RankingBoard({ switcher }: { switcher?: React.ReactNode }) {
  const { status, standings: live, standingsAt } = useRealtime();
  const { config } = useContest();
  const teams = config?.teams ?? [];
  const catOf = new Map(teams.map((t) => [t.id, t.cat]));
  const isMock = live.length === 0 && useMock;
  const all = isMock
    ? CATEGORIES.flatMap((cat) => teams.filter((t) => t.cat === cat).map((t, i) => ({ teamId: t.id, total: 100 - i * 5 })))
    : live;
  const [cat, setCat] = useState<Category>('S');
  const standings = all.filter((t) => catOf.get(t.teamId) === cat);

  // 직전 집계의 순위를 기억해 두었다가 새 집계가 오면 변화량을 계산한다 (순위는 부문 안에서 센다)
  const prevRanks = useRef(new Map<string, number>());
  const [liveDeltas, setLiveDeltas] = useState<Deltas>({});
  useEffect(() => {
    if (live.length === 0) return;
    const count: Partial<Record<Category, number>> = {};
    const ranked = live.map((t) => {
      const c = catOf.get(t.teamId);
      const rank = c ? (count[c] = (count[c] ?? 0) + 1) : 0;
      return [t.teamId, rank] as const;
    });
    const prev = prevRanks.current;
    if (prev.size > 0 && ranked.some(([id, rank]) => prev.get(id) !== rank)) {
      setLiveDeltas(Object.fromEntries(ranked.map(([id, rank]) => [id, (prev.get(id) ?? rank) - rank])));
    }
    prevRanks.current = new Map(ranked);
  }, [live, teams]);
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
            <Podium key={`podium-${cat}`} teams={teams} standings={standings} deltas={deltas} />
            <RankList key={`list-${cat}`} teams={teams} standings={standings} deltas={deltas} />
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
