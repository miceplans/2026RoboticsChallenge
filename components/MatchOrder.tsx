'use client';

import { useState } from 'react';
import { gameNoOf, GROUPS, SIDES, teamName, useContest, type Side } from '@/lib/contest';
import type { Category } from '@/lib/judge/rules';

// 조별 라운드 경기 순서표 (관리자·로그인 사용자 공용).
// 한 줄 = 같은 조 번호의 주니어 경기와 시니어 경기. 순서는 주니어 1조 → 시니어 1조 → 주니어 2조 → … 로 고정.
// myTeam 을 주면 그 팀 칸을 강조한다.
export default function MatchOrder({ myTeam, title = '경기 순서' }: { myTeam?: string; title?: string }) {
  const { config, loaded } = useContest();
  const [round, setRound] = useState<1 | 2>(1);
  const matches = (config?.matches ?? []).filter((m) => m.round === round);
  const teams = config?.teams ?? [];
  const at = (cat: Category, g: number, side: Side) => matches.find((m) => m.cat === cat && m.table === g && m.wave === side)?.team;

  const cell = (cat: Category, g: number) => {
    const ids = SIDES.map((s) => at(cat, g, s));
    const mine = myTeam !== undefined && ids.includes(myTeam);
    return (
      <td className={`px-3 py-2.5 ${mine ? 'bg-[#eaf5ff]' : ''}`}>
        <b className="block">{g}조 <span className="font-normal text-gray-500">(A · B)</span></b>
        <span className="mt-0.5 grid gap-0.5 text-xs text-gray-600">
          {SIDES.map((s, i) => (
            <span key={s} className={`truncate ${ids[i] === myTeam ? 'font-bold text-accent' : ''}`}>
              {s} · {ids[i] ? teamName(teams, ids[i]) : '미배정'}
            </span>
          ))}
        </span>
      </td>
    );
  };
  const no = (cat: Category, g: number) => (
    <td className="w-16 px-3 py-2.5 text-center text-base font-bold tabular-nums text-accent">{gameNoOf({ cat, table: g })}</td>
  );

  return (
    <section className="mt-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">{title}</h1>
          <p className="mt-1 text-sm text-gray-500">주니어 → 시니어 번갈아 진행합니다. 한 조의 두 팀이 A · B 테이블에서 동시에 경기합니다 (경기당 2분).</p>
        </div>
        <div className="flex gap-1 rounded-2xl border border-line bg-white p-1">
          {([1, 2] as const).map((r) => (
            <button key={r} onClick={() => setRound(r)} className={`rounded-xl px-4 py-1.5 text-sm font-bold ${round === r ? 'bg-accent text-white' : 'text-gray-500'}`}>{r}R</button>
          ))}
        </div>
      </div>
      {!loaded ? (
        <p className="mt-4 rounded-2xl border border-line bg-white p-6 text-sm text-gray-500">경기 순서를 불러오는 중입니다…</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[560px] table-fixed text-left text-sm">
            <colgroup><col className="w-16" /><col /><col className="w-16" /><col /></colgroup>
            <thead className="text-white">
              <tr>
                <th className="bg-[#d9773b] px-3 py-3 text-center font-semibold">순서</th>
                <th className="bg-[#d9773b] px-3 py-3 font-semibold">주니어</th>
                <th className="bg-accent px-3 py-3 text-center font-semibold">순서</th>
                <th className="bg-accent px-3 py-3 font-semibold">시니어</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {GROUPS.map((g) => (
                <tr key={g}>
                  {no('J', g)}
                  {cell('J', g)}
                  {no('S', g)}
                  {cell('S', g)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-gray-500">
        <li>다음 경기 조는 경기장 옆에서 대기 후 바로 입장합니다.</li>
        <li>시니어는 경기마다 배치 시트대로 검체 위치를 바꿉니다.</li>
        <li>2차 라운드도 1차와 같은 조·같은 순서로 진행합니다.</li>
      </ul>
    </section>
  );
}
