'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { teamName } from '@/lib/judge/data';
import { useRealtime, type Standing } from '@/lib/realtime/useRealtime';
import { StatusBadge } from './LiveLeaderboard';

// 시상대 위 카드: 1등이 가운데, 2등 왼쪽, 3등 오른쪽 (위치는 시상대 이미지 기준 %)
const podium = [
  { rank: 1, pos: 'left-[38.3%] top-[4.5%]' },
  { rank: 2, pos: 'left-[11.9%] top-[16.6%]' },
  { rank: 3, pos: 'left-[65.9%] top-[26.2%]' },
] as const;

// 개발 중 디자인 확인용 목데이터: 실제 점수가 없을 때만, 프로덕션이 아닐 때만 쓴다
const MOCK: Standing[] = Array.from({ length: 10 }, (_, i) => ({ teamId: `팀명 ${i + 1}`, total: 100 - i * 7 }));
const MOCK_DELTA: Record<string, number> = {
  '팀명 1': 2, '팀명 2': -1, '팀명 3': 0, '팀명 4': 1, '팀명 5': -2, '팀명 6': 3, '팀명 7': 0, '팀명 8': -1, '팀명 9': 1, '팀명 10': -3,
};
const useMock = process.env.NODE_ENV !== 'production';

// 이전 집계 대비 순위 변화: 양수면 상승, 음수면 하락
type Deltas = Record<string, number>;

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

function TeamLabel({ team, delta }: { team?: Standing; delta?: number }) {
  return (
    <>
      <p className="truncate text-base font-semibold sm:text-2xl">{team ? teamName(team.teamId) : '-'}</p>
      <p className="flex items-center justify-center gap-2 text-xs tabular-nums sm:text-lg">
        {team && (
          <>
            {team.total}점 <Delta value={delta} />
          </>
        )}
      </p>
    </>
  );
}

function Podium({ standings, deltas }: { standings: Standing[]; deltas: Deltas }) {
  return (
    <div className="relative mx-auto mt-16 aspect-[596/397] w-full max-w-[780px]">
      <Image src="/images/podium.png" alt="" fill sizes="780px" priority className="object-cover" />
      {podium.map(({ rank, pos }) => (
        <div
          key={rank}
          className={`absolute ${pos} w-[23.3%] min-w-[84px] overflow-hidden rounded-2xl border border-line bg-white px-2 py-2 text-center sm:px-[24px] sm:py-[18px]`}
        >
          <TeamLabel team={standings[rank - 1]} delta={deltas[standings[rank - 1]?.teamId]} />
        </div>
      ))}
    </div>
  );
}

function RankList({ standings, deltas }: { standings: Standing[]; deltas: Deltas }) {
  return (
    <ol className="mx-auto mt-10 flex w-full max-w-[960px] flex-col gap-2">
      {standings.slice(3, 10).map((s, i) => (
        <li key={s.teamId} className="flex items-center gap-5">
          <span className="w-[50px] shrink-0 text-[32px] font-semibold text-heading">{i + 4}</span>
          <div className="h-[72px] min-w-0 flex-1 overflow-hidden rounded-2xl border border-line bg-white px-[19px] py-[14px] sm:[&_p:first-child]:!text-xl sm:[&_p:last-child]:!text-base [&_p:last-child]:!justify-start">
            <TeamLabel team={s} delta={deltas[s.teamId]} />
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function RankingBoard() {
  const { status, standings: live, standingsAt } = useRealtime();
  const isMock = live.length === 0 && useMock;
  const standings = isMock ? MOCK : live;

  // 직전 집계의 순위를 기억해 두었다가 새 집계가 오면 변화량을 계산한다
  const prevRanks = useRef(new Map<string, number>());
  const [liveDeltas, setLiveDeltas] = useState<Deltas>({});
  useEffect(() => {
    if (live.length === 0) return;
    const next = new Map(live.map((t, i) => [t.teamId, i + 1]));
    const prev = prevRanks.current;
    if (prev.size > 0 && live.some((t, i) => prev.get(t.teamId) !== i + 1)) {
      setLiveDeltas(Object.fromEntries(live.map((t, i) => [t.teamId, (prev.get(t.teamId) ?? i + 1) - (i + 1)])));
    }
    prevRanks.current = next;
  }, [live]);
  const deltas = isMock ? MOCK_DELTA : liveDeltas;
  return (
    <section className="relative min-h-screen overflow-hidden bg-white pt-[73px] pb-24 font-sans">
      <div className="relative mx-auto max-w-[1280px] px-6 pt-12">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-extrabold text-heading [word-break:keep-all]">대회 진행</h1>
          <span className="[&_span]:!text-gray-500"><StatusBadge status={status} /></span>
        </div>
        {standings.length === 0 ? (
          <p className="mt-24 text-center text-gray-500">아직 집계된 점수가 없습니다.</p>
        ) : (
          <>
            <Podium standings={standings} deltas={deltas} />
            <RankList standings={standings} deltas={deltas} />
            {standingsAt && (
              <p className="mt-6 text-center text-xs text-gray-400">마지막 수신 {new Date(standingsAt).toLocaleTimeString('ko-KR')}</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
