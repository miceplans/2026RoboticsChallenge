'use client';

import { useState } from 'react';
import { teamName, useContest } from '@/lib/contest';
import type { Category } from '@/lib/judge/rules';
import GroupDrawTable, { boardOf, slotKey, type Round } from './GroupDrawTable';

// 공개 '조 추첨' 탭. 관리자가 칸을 채울 때마다 서버가 config 이벤트를 보내므로 실시간으로 채워진다.
const CATS: Category[] = ['J', 'S'];

export default function GroupDrawBoard({ switcher }: { switcher?: React.ReactNode }) {
  const { config, loaded } = useContest();
  const teams = config?.teams ?? [];
  const matches = config?.matches ?? [];
  // 직접 고르기 전에는 배정이 시작된 가장 최근 라운드를 보여준다
  const [picked, setPicked] = useState<Round | null>(null);
  const round: Round = picked ?? (matches.some((m) => m.round === 2) ? 2 : 1);

  return (
    <section className="relative min-h-screen overflow-hidden bg-white pt-[73px] pb-24 font-sans">
      <div className="relative mx-auto max-w-[1280px] px-6 pt-12">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-3xl font-extrabold text-heading [word-break:keep-all]">대회 진행</h1>
          {switcher}
        </div>
        <nav className="flex gap-2 border-b border-line">
          {([1, 2] as Round[]).map((r) => (
            <button
              key={r}
              onClick={() => setPicked(r)}
              className={`px-4 py-3 text-base font-bold ${round === r ? 'border-b-2 border-accent text-accent' : 'text-gray-500'}`}
            >
              {r}차 조 추첨
            </button>
          ))}
        </nav>
        {!loaded ? (
          <p className="mt-24 text-center text-gray-500">조 추첨 결과를 불러오는 중입니다…</p>
        ) : (
          <div className="mt-8 grid gap-8 md:grid-cols-2">
            {CATS.map((cat) => {
              const board = boardOf(matches, cat, round);
              return (
                <GroupDrawTable
                  key={cat}
                  cat={cat}
                  teamCount={teams.filter((t) => t.cat === cat).length || 16}
                  renderTeam={(g, side) => {
                    const id = board[slotKey(g, side)];
                    return id ? (
                      <span key={`${round}-${id}`} className="draw-reveal block truncate font-semibold text-gray-900" title={teamName(teams, id)}>
                        {teamName(teams, id)}
                      </span>
                    ) : null;
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
