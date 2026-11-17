'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/components/Toast';
import { useContest } from '@/lib/contest';
import { CATEGORY_NAMES, type Category } from '@/lib/judge/rules';
import { adminFetch, btn, btnPrimary, card } from './shared';

type RoundScores = Record<string, { r1: string; r2: string }>;

export default function RoundScores() {
  const toast = useToast();
  const [cat, setCat] = useState<Category>('S');
  const [scores, setScores] = useState<RoundScores>({});
  const [dirty, setDirty] = useState(false);
  const { config } = useContest();
  const teams = config?.teams ?? [];

  useEffect(() => {
    adminFetch<{ settings: { roundScores: RoundScores } }>('/admin/settings')
      .then((d) => setScores(d.settings.roundScores ?? {}))
      .catch((e: Error) => toast(e.message));
  }, [toast]);

  const save = async () => {
    try {
      await adminFetch('/admin/settings', { method: 'PUT', body: { roundScores: scores } });
      setDirty(false);
      toast('저장했습니다.');
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const set = (id: string, key: 'r1' | 'r2', v: string) => {
    setScores((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { r1: '', r2: '' }), [key]: v } }));
    setDirty(true);
  };

  const num = (v?: string | number) => (v === undefined || String(v).trim() === '' || isNaN(Number(v)) ? null : Number(v));
  const rows = teams.filter((t) => t.cat === cat).map((t) => {
    const r1 = num(scores[t.id]?.r1);
    const r2 = num(scores[t.id]?.r2);
    return { team: t, r1, r2, total: r1 === null && r2 === null ? null : Math.max(r1 ?? -Infinity, r2 ?? -Infinity) }; // 합산이 아니라 1·2라운드 중 높은 점수
  });
  // 동점이면 같은 순위(1, 1, 3 …). 점수가 하나도 없는 팀은 순위 없음. 근사 비교로 소수점 오차를 무시한다.
  const ranked = rows.filter((r) => r.total !== null).map((r) => r.total as number).sort((a, b) => b - a);
  const rankOf = (total: number | null) => {
    if (total === null) return null;
    const i = ranked.findIndex((t) => Math.abs(t - total) < 1e-9);
    return i < 0 ? null : i + 1;
  };

  return (
    <section className={`${card} p-6`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl font-extrabold text-heading">심사 점수</h1>
        <div className="flex gap-2">
          <button className={btn} onClick={() => { if (confirm(`${CATEGORY_NAMES[cat]} 점수를 모두 지울까요?`)) { setScores((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => teams.find((t) => t.id === id)?.cat !== cat))); setDirty(true); } }}>점수 초기화</button>
          <button className={`${btnPrimary} disabled:opacity-40`} disabled={!dirty} onClick={save}>{dirty ? '저장' : '저장됨'}</button>
        </div>
      </div>
      <p className="mt-2 text-sm text-gray-500">1·2라운드 심사 점수를 입력하면 두 라운드 중 높은 점수와 순위가 자동으로 계산됩니다. (서버에 저장됩니다)</p>
      <nav className="mt-4 flex gap-2 border-b border-line">
        {(['S', 'J'] as Category[]).map((c) => (
          <button key={c} onClick={() => setCat(c)} className={`px-4 py-2 text-sm font-bold ${cat === c ? 'border-b-2 border-accent text-accent' : 'text-gray-500'}`}>{CATEGORY_NAMES[c]}</button>
        ))}
      </nav>
      <div className="mt-5 overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-accent text-white">
            <tr>
              <th className="px-4 py-3 font-semibold">팀</th>
              <th className="px-4 py-3 font-semibold">소속</th>
              <th className="px-4 py-3 text-right font-semibold">1라운드</th>
              <th className="px-4 py-3 text-right font-semibold">2라운드</th>
              <th className="px-4 py-3 text-right font-semibold">최종(높은 점수)</th>
              <th className="px-4 py-3 text-right font-semibold">순위(자동집계)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(({ team, total }) => {
              const rank = rankOf(total);
              return (
                <tr key={team.id}>
                  <td className="px-4 py-2 font-medium">{team.id} · {team.name}</td>
                  <td className="px-4 py-2 text-gray-600">{team.region} · {team.org}</td>
                  {(['r1', 'r2'] as const).map((k) => (
                    <td key={k} className="px-4 py-2 text-right">
                      <input
                        type="number" inputMode="decimal" min={0} step="any"
                        value={scores[team.id]?.[k] ?? ''}
                        onChange={(e) => set(team.id, k, e.target.value)}
                        aria-label={`${team.name} ${k === 'r1' ? '1' : '2'}라운드 점수`}
                        className="w-24 rounded-lg border border-line bg-white px-2 py-1 text-right tabular-nums"
                      />
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">{total ?? '-'}</td>
                  <td className={`px-4 py-2 text-right font-bold tabular-nums ${rank && rank <= 3 ? 'text-accent' : ''}`}>{rank ?? '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
