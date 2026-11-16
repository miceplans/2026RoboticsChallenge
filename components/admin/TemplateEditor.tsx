'use client';

import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/Toast';
import { refreshContest, useContest } from '@/lib/contest';
import { ITEMS, parseTemplate, type Item } from '@/lib/judge/rules';
import { adminFetch, btn, btnPrimary, card, Icon } from './shared';

export default function TemplateEditor() {
  const toast = useToast();
  const { config } = useContest();
  const [items, setItems] = useState<Item[]>(ITEMS);
  const [dirty, setDirty] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current || config === null) return;
    initialized.current = true;
    setItems(parseTemplate(config.template) ?? ITEMS);
  }, [config]);

  const patch = (i: number, p: Partial<Item>) => {
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...p } : it)));
    setDirty(true);
  };
  const save = async () => {
    try {
      await adminFetch('/admin/template', { method: 'PUT', body: { items } });
      setDirty(false);
      toast('채점표 템플릿을 저장했습니다. 심판 화면에 즉시 반영됩니다.');
      refreshContest();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const reset = async () => {
    if (!confirm('기본 채점표로 복원할까요?')) return;
    try {
      await adminFetch('/admin/template/reset', { method: 'POST' });
      setItems(ITEMS);
      setDirty(false);
      toast('기본값으로 복원했습니다.');
      refreshContest();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <section className={`${card} p-6`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl font-extrabold text-heading">채점표 템플릿</h1>
        <div className="flex gap-2">
          <button className={btn} onClick={reset}>기본값 복원</button>
          <button className={`${btnPrimary} disabled:opacity-40`} disabled={!dirty} onClick={save}>{dirty ? '저장' : '저장됨'}</button>
        </div>
      </div>
      <p className="mt-2 text-sm text-gray-500">저장하면 심판 채점 화면의 항목과 배점이 즉시 바뀝니다. 시니어 배점이 0인 항목은 시니어 화면에 표시되지 않습니다.</p>
      <div className="mt-5 overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-accent text-white">
            <tr>
              <th className="px-4 py-3 font-semibold">채점 항목</th>
              <th className="px-4 py-3 font-semibold">미션</th>
              <th className="px-4 py-3 font-semibold">입력</th>
              <th className="px-4 py-3 font-semibold">최대 개수</th>
              <th className="px-4 py-3 font-semibold">주니어</th>
              <th className="px-4 py-3 font-semibold">시니어</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((it, i) => (
              <tr key={it.id}>
                <td className="px-4 py-2">
                  <input value={it.label} onChange={(e) => patch(i, { label: e.target.value })} className="w-full min-w-[220px] rounded-lg border border-line bg-white px-2 py-1" />
                </td>
                <td className="px-4 py-2">
                  <select value={it.m} onChange={(e) => patch(i, { m: e.target.value as Item['m'] })} className="rounded-lg border border-line bg-white px-2 py-1">
                    <option value="M1">M1</option>
                    <option value="M2">M2</option>
                    <option value="PEN">감점</option>
                  </select>
                </td>
                <td className="px-4 py-2">
                  <select value={it.type} onChange={(e) => patch(i, { type: e.target.value as Item['type'] })} className="rounded-lg border border-line bg-white px-2 py-1">
                    <option value="count">개수</option>
                    <option value="bool">여부</option>
                    <option value="auto">자동 계산</option>
                    <option value="manual">직접 입력</option>
                  </select>
                </td>
                <td className="px-4 py-2">
                  <input type="number" min={1} value={it.max ?? ''} disabled={it.type !== 'count'} onChange={(e) => patch(i, { max: e.target.value === '' ? undefined : Number(e.target.value) })} className="w-20 rounded-lg border border-line bg-white px-2 py-1 text-right tabular-nums disabled:opacity-40" />
                </td>
                <td className="px-4 py-2">
                  <input type="number" value={it.pj} onChange={(e) => patch(i, { pj: Number(e.target.value) })} className="w-20 rounded-lg border border-line bg-white px-2 py-1 text-right tabular-nums" />
                </td>
                <td className="px-4 py-2">
                  <input type="number" value={it.ps} onChange={(e) => patch(i, { ps: Number(e.target.value) })} className="w-20 rounded-lg border border-line bg-white px-2 py-1 text-right tabular-nums" />
                </td>
                <td className="px-4 py-2 text-right">
                  <button className={`${btn} !py-1`} onClick={() => { setItems((prev) => prev.filter((_, j) => j !== i)); setDirty(true); }}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-6">
        <button
          className={`${btnPrimary} inline-flex items-center gap-1`}
          onClick={() => { setItems((prev) => [...prev, { id: `x${Date.now()}`, m: 'M1', label: '새 항목', type: 'count', max: 1, pj: 0, ps: 0 }]); setDirty(true); }}
        >
          <Icon name="add" />항목 추가
        </button>
      </div>
    </section>
  );
}
