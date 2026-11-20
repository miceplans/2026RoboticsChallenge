'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { teamName } from '@/lib/judge/data';
import { ranksOf } from '@/lib/realtime/rank';
import { useRealtime, type Standing } from '@/lib/realtime/useRealtime';
import { StatusBadge } from './LiveLeaderboard';

// 시상대 위 카드 (시상대 이미지 기준 %): 1등 가운데, 2등 왼쪽, 3등 오른쪽
const podium = [
  { rank: 1, pos: 'left-[35.1%] top-[-16.6%] w-[27.4%] rounded-xl shadow-[0_-4px_50px_#d5a73a]', size: 'text-[clamp(12px,1.6vw,20px)]', sub: 'text-[clamp(10px,1.3vw,16px)]' },
  { rank: 2, pos: 'left-[8.1%] top-[11.4%] w-[22%] rounded-[10px] shadow-[0_-3px_40px_white]', size: 'text-[clamp(10px,1.3vw,16px)]', sub: 'text-[clamp(9px,1vw,13px)]' },
  { rank: 3, pos: 'left-[67.7%] top-[26.4%] w-[20.5%] rounded-[9px] shadow-[0_-3px_37px_rgba(209,91,0,0.5)]', size: 'text-[clamp(9px,1.2vw,15px)]', sub: 'text-[clamp(8px,0.95vw,12px)]' },
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

function Podium({ standings, deltas }: { standings: Standing[]; deltas: Deltas }) {
  return (
    <div className="relative mx-auto mt-28 aspect-[2/1] w-full max-w-[507px]">
      <Image src="/images/ranking-podium.png" alt="" fill sizes="507px" priority className="object-cover" />
      {podium.map(({ rank, pos, size, sub }) => {
        const team = standings[rank - 1];
        return (
          <div key={rank} className={`absolute ${pos} overflow-hidden bg-white px-[8%] py-[5%] text-center text-black`}>
            <p className={`truncate font-semibold ${size}`}>{team ? teamName(team.teamId) : '-'}</p>
            <p className={`flex items-center justify-center gap-1 tabular-nums ${sub}`}>
              {team && (
                <>
                  {team.total}점 <Delta value={deltas[team.teamId]} />
                </>
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function RankList({ standings, deltas }: { standings: Standing[]; deltas: Deltas }) {
  const ranks = ranksOf(standings);
  return (
    <ol className="mx-auto mt-10 flex w-full max-w-[650px] flex-col gap-3">
      {standings.slice(3, 10).map((s, i) => (
        <li key={s.teamId} className="relative h-[72px] overflow-hidden rounded-xl bg-white/80 shadow-[4px_4px_20px_rgba(0,0,0,0.25)]">
          <span className="absolute -left-[18px] -top-8 select-none text-[114px] font-bold leading-[normal] text-[#ebebf1]">{ranks[i + 3]}</span>
          <div className="absolute left-20 right-4 top-[13px] min-w-0 text-black">
            <p className="truncate text-xl font-semibold">{teamName(s.teamId)}</p>
            <p className="flex items-center gap-2 text-base tabular-nums">
              {s.total}점 <Delta value={deltas[s.teamId]} />
            </p>
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
    const ranks = ranksOf(live);
    const next = new Map(live.map((t, i) => [t.teamId, ranks[i]]));
    const prev = prevRanks.current;
    if (prev.size > 0 && live.some((t, i) => prev.get(t.teamId) !== ranks[i])) {
      setLiveDeltas(Object.fromEntries(live.map((t, i) => [t.teamId, (prev.get(t.teamId) ?? ranks[i]) - ranks[i]])));
    }
    prevRanks.current = next;
  }, [live]);
  const deltas = isMock ? MOCK_DELTA : liveDeltas;
  return (
    <section className="relative min-h-screen overflow-hidden bg-[#0c0c2e] pt-[73px] pb-24 font-sans">
      <Image src="/images/ranking-bg.png" alt="" width={768} height={968} priority className="pointer-events-none absolute left-1/2 top-0 w-[1354px] max-w-none -translate-x-1/2 object-cover" />
      <Image src="/images/ranking-bg.png" alt="" width={768} height={968} className="pointer-events-none absolute left-1/2 top-0 w-[970px] max-w-none -translate-x-1/2 object-cover blur-[5px]" />
      <div className="relative mx-auto max-w-[1280px] px-6 pt-12">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-extrabold text-white [word-break:keep-all]">대회 진행</h1>
          <span className="[&_span]:!text-gray-300"><StatusBadge status={status} /></span>
        </div>
        {standings.length === 0 ? (
          <p className="mt-24 text-center text-gray-300">아직 집계된 점수가 없습니다.</p>
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
