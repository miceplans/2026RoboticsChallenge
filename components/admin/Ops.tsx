'use client';

import { useState } from 'react';
import { computeSchedule, slotLabel, teamName, useContest } from '@/lib/contest';
import { type Category } from '@/lib/judge/rules';
import { card } from './shared';
import GroupDraw from './GroupDraw';

export default function Ops() {
  const { config } = useContest();
  const teams = config?.teams ?? [];
  const matches = config?.matches ?? [];
  const schedule = computeSchedule(matches);
  const [catF, setCatF] = useState<'' | Category>('');
  const [roundF, setRoundF] = useState<0 | 1 | 2>(0);
  const visible = schedule.filter((m) => (catF ? m.cat === catF : true) && (roundF ? m.round === roundF : true));

  const [teamId, setTeamId] = useState('');
  const teamRows = teamId ? schedule.filter((m) => m.team === teamId) : schedule;

  return (
    <section className={`${card} p-6`}>
      <h1 className="text-3xl font-extrabold text-heading">운영 순서</h1>
      <p className="mt-2 text-sm text-gray-500">조 추첨 결과를 부문·라운드별로 배치합니다. 한 조의 두 팀이 A·B 테이블에서 동시에 경기하며(2분), 저장하면 심판·참가자 화면의 순서 안내에도 반영됩니다.</p>

      <div className="mt-8"><GroupDraw /></div>

      <h2 className="mt-10 font-semibold">전체 진행 일정표</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {([{ id: '', label: '전체' }, { id: 'S', label: '시니어' }, { id: 'J', label: '주니어' }] as { id: '' | Category; label: string }[]).map((c) => (
          <button key={c.id} onClick={() => setCatF(c.id)} className={`rounded-2xl border px-3 py-1.5 text-sm ${catF === c.id ? 'border-accent bg-accent text-white' : 'border-line text-gray-600 hover:border-line-hover'}`}>{c.label}</button>
        ))}
        <span className="mx-1 hidden h-4 w-px bg-line sm:block" />
        {([{ id: 0, label: '전체' }, { id: 1, label: '1차' }, { id: 2, label: '2차' }] as { id: 0 | 1 | 2; label: string }[]).map((r) => (
          <button key={r.id} onClick={() => setRoundF(r.id)} className={`rounded-2xl border px-3 py-1.5 text-sm ${roundF === r.id ? 'border-accent bg-accent text-white' : 'border-line text-gray-600 hover:border-line-hover'}`}>{r.label}</button>
        ))}
      </div>
      <div className="mt-3 overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-accent text-white">
            <tr>
              <th className="px-4 py-3 font-semibold">경기</th>
              <th className="px-4 py-3 font-semibold">부문</th>
              <th className="px-4 py-3 font-semibold">차수</th>
              <th className="px-4 py-3 font-semibold">조</th>
              <th className="px-4 py-3 font-semibold">테이블</th>
              <th className="px-4 py-3 font-semibold">팀</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-2.5 font-bold tabular-nums text-accent">{m.game}</td>
                <td className="px-4 py-2.5">{m.cat === 'J' ? '주니어' : '시니어'}</td>
                <td className="px-4 py-2.5">{m.round}차</td>
                <td className="px-4 py-2.5">{m.table}조</td>
                <td className="px-4 py-2.5">{m.wave}</td>
                <td className="px-4 py-2.5 font-medium">{m.team} · {teamName(teams, m.team)}</td>
              </tr>
            ))}
            {visible.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">표시할 경기가 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 font-semibold">팀 순번 조회</h2>
      <p className="mt-1 text-xs text-gray-500">팀을 고르면 그 팀 경기만 순번 순으로 봅니다. 선택하지 않으면 전체 일정을 순번 순으로 보여줍니다.</p>
      <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="mt-3 rounded-xl border border-line bg-white px-3 py-2 text-sm" aria-label="팀 선택">
        <option value="">팀 선택</option>
        {[...teams].sort((a, b) => a.name.localeCompare(b.name, 'ko')).map((t) => (
          <option key={t.id} value={t.id}>{t.name} ({t.id})</option>
        ))}
      </select>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {teamRows.map((m) => (
          <div key={m.id} className="rounded-xl border border-line bg-white px-4 py-3 text-sm">
            <p><b className="tabular-nums text-accent">{m.round}R {m.game}번째 경기</b> <span className="text-gray-600">· {slotLabel(m)}</span></p>
            {!teamId && <p className="mt-0.5 text-gray-500">{m.team} · {teamName(teams, m.team)}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
