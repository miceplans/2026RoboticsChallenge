'use client';

import { useState } from 'react';
import { useToast } from '@/components/Toast';
import { computeSchedule, tablesOf, teamName, useContest, refreshContest } from '@/lib/contest';
import { type Category } from '@/lib/judge/rules';
import { adminFetch, btn, btnPrimary, card } from './shared';

// 테이블 진행 순서: 끌어서 바꾼다. 1R·2R 이 같은 순서를 쓴다.
export function TableOrderEditor({ onChange }: { onChange?: (order: number[] | null) => void }) {
  const toast = useToast();
  const { config } = useContest();
  const serverOrder = config?.settings.tableOrder?.length ? config.settings.tableOrder : tablesOf(config?.matches ?? []);
  const [order, setOrder] = useState<number[] | null>(null); // null = 서버 값 그대로
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const list = order ?? serverOrder;
  const dirty = order !== null && order.join('|') !== serverOrder.join('|');
  const set = (next: number[] | null) => {
    setOrder(next);
    onChange?.(next);
  };
  const drop = (target: number) => {
    if (drag === null || drag === target) return;
    const next = [...list];
    next.splice(next.indexOf(drag), 1);
    next.splice(next.indexOf(target), 0, drag);
    set(next);
  };
  const save = async () => {
    try {
      await adminFetch('/admin/settings', { method: 'PUT', body: { tableOrder: list } });
      set(null);
      toast('테이블 진행 순서를 저장했습니다.');
      refreshContest();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  return (
    <div>
      <h2 className="font-semibold">경기 진행 순서 <span className="text-xs font-normal text-gray-500">1R · 2R 동일</span></h2>
      <p className="mt-1 text-xs text-gray-500">테이블을 끌어서 순서를 바꿉니다. 1번부터 차례로 진행하며 1R·2R에 같은 순서가 적용됩니다.</p>
      <ol className="mt-3 flex flex-wrap items-center gap-2">
        {list.map((t, i) => (
          <li
            key={t}
            draggable
            onDragStart={(e) => { e.dataTransfer.setData('text/plain', `table:${t}`); setDrag(t); }}
            onDragEnd={() => { setDrag(null); setOver(null); }}
            onDragOver={(e) => { e.preventDefault(); setOver(t); }}
            onDragLeave={() => setOver((o) => (o === t ? null : o))}
            onDrop={(e) => { e.preventDefault(); drop(t); setOver(null); setDrag(null); }}
            className={`flex cursor-grab items-center gap-1.5 rounded-xl border bg-white px-3 py-2 text-sm ${over === t && drag !== t ? 'border-accent' : 'border-line'} ${drag === t ? 'opacity-40' : ''}`}
          >
            <span className="w-5 text-center font-bold tabular-nums text-accent">{i + 1}</span>
            <span className="font-medium">테이블 {t}</span>
          </li>
        ))}
        <button onClick={save} disabled={!dirty} className={`${btnPrimary} disabled:opacity-40`}>{dirty ? '저장' : '저장됨'}</button>
      </ol>
    </div>
  );
}

export default function Ops() {
  const { config } = useContest();
  const teams = config?.teams ?? [];
  const matches = config?.matches ?? [];
  const serverOrder = config?.settings.tableOrder?.length ? config.settings.tableOrder : tablesOf(matches);
  const [order, setOrder] = useState<number[] | null>(null); // 편집 중인 순서 (null = 서버 값)

  // 일정 표시와 순번 계산은 편집 중인 순서를 기준으로 한다
  const schedule = computeSchedule(matches, order ?? serverOrder);
  const [catF, setCatF] = useState<'' | Category>('');
  const [roundF, setRoundF] = useState<0 | 1 | 2>(0);
  const visible = schedule.filter((m) => (catF ? m.cat === catF : true) && (roundF ? m.round === roundF : true));

  const [teamId, setTeamId] = useState('');
  const teamRows = teamId ? schedule.filter((m) => m.team === teamId) : schedule;

  return (
    <section className={`${card} p-6`}>
      <h1 className="text-3xl font-extrabold text-heading">운영 순서</h1>
      <p className="mt-2 text-sm text-gray-500">테이블 진행 순서를 정하면 전체 경기 순번이 자동으로 다시 계산됩니다. 저장하면 심판·참가자 화면의 순번 안내에도 반영됩니다.</p>

      <div className="mt-8"><TableOrderEditor onChange={setOrder} /></div>

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
              <th className="px-4 py-3 font-semibold">순번</th>
              <th className="px-4 py-3 font-semibold">부문</th>
              <th className="px-4 py-3 font-semibold">차수</th>
              <th className="px-4 py-3 font-semibold">웨이브</th>
              <th className="px-4 py-3 font-semibold">테이블</th>
              <th className="px-4 py-3 font-semibold">필드</th>
              <th className="px-4 py-3 font-semibold">팀</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-2.5 font-bold tabular-nums text-accent">{m.seq}</td>
                <td className="px-4 py-2.5">{m.cat === 'J' ? '주니어' : '시니어'}</td>
                <td className="px-4 py-2.5">{m.round}차</td>
                <td className="px-4 py-2.5">{m.wave}조</td>
                <td className="px-4 py-2.5">테이블 {m.table}</td>
                <td className="px-4 py-2.5">{m.field}</td>
                <td className="px-4 py-2.5 font-medium">{m.team} · {teamName(teams, m.team)}</td>
              </tr>
            ))}
            {visible.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">표시할 경기가 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 font-semibold">팀 순번 조회</h2>
      <p className="mt-1 text-xs text-gray-500">팀을 고륾면 그 팀 경기만 순번 순으로 봅니다. 선택하지 않으면 전체 일정을 순번 순으로 보여줍니다.</p>
      <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="mt-3 rounded-xl border border-line bg-white px-3 py-2 text-sm" aria-label="팀 선택">
        <option value="">팀 선택</option>
        {[...teams].sort((a, b) => a.name.localeCompare(b.name, 'ko')).map((t) => (
          <option key={t.id} value={t.id}>{t.name} ({t.id})</option>
        ))}
      </select>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {teamRows.map((m) => (
          <div key={m.id} className="rounded-xl border border-line bg-white px-4 py-3 text-sm">
            <p><b className="tabular-nums text-accent">{m.seq}번째</b> <span className="text-gray-600">· {m.round}차 · {m.wave}조 테이블 {m.table} {m.field}</span></p>
            {!teamId && <p className="mt-0.5 text-gray-500">{m.team} · {teamName(teams, m.team)}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
