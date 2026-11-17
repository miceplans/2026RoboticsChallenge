'use client';

import { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/Toast';
import { fieldOfSide, gameNoOf, GROUPS, SIDES, teamName, useContest, refreshContest, type Match, type Side } from '@/lib/contest';
import { CATEGORY_NAMES, type Category } from '@/lib/judge/rules';
import { adminFetch, btn, btnPrimary } from './shared';

// 조 추첨 결과 입력: 부문·라운드마다 16칸(1~8조 × A/B)에 팀을 끌어다 놓는다.
// 칸 키는 '조-A|B'. 저장하면 그 부문·라운드의 matches 줄만 바꾸고 나머지는 그대로 보낸다.
type Round = 1 | 2;
type Board = Record<string, string | undefined>; // 칸 → 팀 ID
const slotKey = (g: number, side: Side) => `${g}-${side}`;
const SLOT_KEYS = GROUPS.flatMap((g) => SIDES.map((s) => slotKey(g, s)));

function boardOf(matches: Match[], cat: Category, round: Round): Board {
  const b: Board = {};
  for (const m of matches) if (m.cat === cat && m.round === round) b[slotKey(m.table, m.wave)] = m.team;
  return b;
}
const sameBoard = (a: Board, b: Board) => SLOT_KEYS.every((k) => (a[k] ?? '') === (b[k] ?? ''));

export default function GroupDraw() {
  const toast = useToast();
  const { config } = useContest();
  const teams = config?.teams ?? [];
  const matches = config?.matches ?? [];
  const [cat, setCat] = useState<Category>('J');
  const [round, setRound] = useState<Round>(1);
  const [draft, setDraft] = useState<Board | null>(null); // null = 서버 값 그대로
  const [drag, setDrag] = useState<string | null>(null); // 'team:ID' | 'slot:키'
  const [over, setOver] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null); // 터치용: 먼저 누른 팀/칸
  const [saving, setSaving] = useState(false);

  const server = useMemo(() => boardOf(matches, cat, round), [matches, cat, round]);
  const board = draft ?? server;
  const dirty = draft !== null && !sameBoard(draft, server);
  // 부문·라운드를 바꾸면 편집 중이던 배치는 버린다 (저장 안 한 변경이 있으면 확인)
  useEffect(() => setDraft(null), [cat, round]);
  const go = (fn: () => void) => {
    if (dirty && !confirm('저장하지 않은 배치가 있습니다. 버리고 이동할까요?')) return;
    setPicked(null);
    fn();
  };

  const catTeams = teams.filter((t) => t.cat === cat).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const placed = new Set(Object.values(board).filter(Boolean));
  const pool = catTeams.filter((t) => !placed.has(t.id));
  const count = SLOT_KEYS.filter((k) => board[k]).length;

  const edit = (fn: (b: Board) => Board) => setDraft(fn({ ...board }));
  // from: 'team:ID' 또는 'slot:키'. 칸끼리는 자리를 바꾸고, 팀을 칸에 놓으면 원래 그 칸의 팀은 대기 목록으로 간다.
  const dropOnSlot = (key: string, from: string) => {
    const [kind, val] = [from.slice(0, from.indexOf(':')), from.slice(from.indexOf(':') + 1)];
    edit((b) => {
      if (kind === 'slot') {
        if (val === key) return b;
        [b[val], b[key]] = [b[key], b[val]];
      } else if (kind === 'team') {
        for (const k of SLOT_KEYS) if (b[k] === val) b[k] = undefined;
        b[key] = val;
      }
      return b;
    });
  };
  const dropOnPool = (from: string) => {
    if (!from.startsWith('slot:')) return;
    const key = from.slice(5);
    edit((b) => ({ ...b, [key]: undefined }));
  };
  const clickSlot = (key: string) => {
    if (picked) {
      dropOnSlot(key, picked);
      setPicked(null);
    } else if (board[key]) setPicked(`slot:${key}`);
  };

  const copyRound1 = () => setDraft(boardOf(matches, cat, 1));

  const save = async () => {
    setSaving(true);
    try {
      // 같은 팀·라운드의 기존 경기 ID 를 유지해야 이미 들어온 점수(scores FK)가 끊기지 않는다
      const idOf = (team: string) => matches.find((m) => m.round === round && m.team === team)?.id ?? `R${round}-${team}`;
      const others = matches.filter((m) => !(m.cat === cat && m.round === round));
      const mine: Match[] = SLOT_KEYS.flatMap((k) => {
        const team = board[k];
        if (!team) return [];
        const [g, side] = k.split('-') as [string, Side];
        return [{ id: idOf(team), round, cat, wave: side, table: Number(g), field: fieldOfSide(side), team }];
      });
      const all = [...others, ...mine].map(({ id, round, cat, wave, table, field, team }) => ({ id, round, cat, wave, table, field, team }));
      if (all.length === 0) throw new Error('배정된 팀이 없습니다.');
      await adminFetch('/admin/matches', { method: 'PUT', body: { matches: all } });
      setDraft(null);
      toast(`${CATEGORY_NAMES[cat]} ${round}R 조 배정을 저장했습니다.`);
      refreshContest();
    } catch (e) {
      const msg = (e as Error).message;
      toast(msg === 'matches_in_use' ? '이미 점수가 들어온 팀은 배정에서 뺄 수 없습니다. (칸 이동은 가능)' : msg.startsWith('slot_taken:') ? `한 칸에 두 팀이 배정돼 있습니다 (${msg.slice(11)}). 새로고침 후 다시 배치해 주세요.` : msg);
    } finally {
      setSaving(false);
    }
  };

  const tab = (on: boolean) => `px-4 py-2 text-sm font-bold ${on ? 'border-b-2 border-accent text-accent' : 'text-gray-500'}`;
  const chip = (id: string, from: string, extra = '') => (
    <span
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', from); setDrag(from); }}
      onDragEnd={() => { setDrag(null); setOver(null); }}
      className={`block cursor-grab truncate rounded-lg border bg-white px-2.5 py-1.5 text-sm font-medium ${picked === from ? 'border-accent ring-2 ring-accent/30' : 'border-line'} ${drag === from ? 'opacity-40' : ''} ${extra}`}
      title={`${teamName(teams, id)} (${id})`}
    >
      {teamName(teams, id)}
    </span>
  );

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold">조 추첨 배정</h2>
          <p className="mt-1 text-xs text-gray-500">추첨 결과대로 팀을 끌어서 칸에 놓습니다. 칸끼리 끌면 자리가 바뀌고, 칸에서 대기 목록으로 끌면 빠집니다. (터치: 팀을 누른 뒤 칸을 누르세요)</p>
        </div>
        <div className="flex gap-2">
          {round === 2 && <button onClick={copyRound1} className={btn}>1R 배정 복사</button>}
          <button onClick={() => setDraft({})} className={btn}>비우기</button>
          {dirty && <button onClick={() => setDraft(null)} className={btn}>되돌리기</button>}
          <button onClick={save} disabled={!dirty || saving} className={`${btnPrimary} disabled:opacity-40`}>{saving ? '저장 중…' : dirty ? '저장' : '저장됨'}</button>
        </div>
      </div>

      <nav className="mt-4 flex flex-wrap gap-2 border-b border-line">
        {(['J', 'S'] as Category[]).map((c) => <button key={c} onClick={() => c !== cat && go(() => setCat(c))} className={tab(cat === c)}>{CATEGORY_NAMES[c]}</button>)}
        <span className="mx-2 my-2 w-px bg-line" />
        {([1, 2] as Round[]).map((r) => <button key={r} onClick={() => r !== round && go(() => setRound(r))} className={tab(round === r)}>{r}R</button>)}
      </nav>

      <div className="mt-4 grid gap-4 lg:grid-cols-[220px_1fr]">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); dropOnPool(e.dataTransfer.getData('text/plain')); setDrag(null); }}
          onClick={() => { if (picked?.startsWith('slot:')) { dropOnPool(picked); setPicked(null); } }}
          className="rounded-xl bg-[#e5f3ff] p-3"
        >
          <div className="flex items-center justify-between text-sm"><b>대기 팀</b><span className="text-xs text-gray-500">{count}/16 배치</span></div>
          <ul className="mt-2 space-y-1.5">
            {pool.map((t) => (
              <li key={t.id} onClick={(e) => { e.stopPropagation(); setPicked((p) => (p === `team:${t.id}` ? null : `team:${t.id}`)); }}>
                {chip(t.id, `team:${t.id}`)}
              </li>
            ))}
            {pool.length === 0 && <li className="py-4 text-center text-xs text-gray-500">모든 팀이 배치됐습니다.</li>}
          </ul>
        </div>

        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="bg-accent text-white">
              <tr>
                <th className="w-16 px-3 py-2.5 text-center font-semibold">순서</th>
                <th className="w-16 px-3 py-2.5 font-semibold">조</th>
                <th className="px-3 py-2.5 font-semibold">A 테이블</th>
                <th className="px-3 py-2.5 font-semibold">B 테이블</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {GROUPS.map((g) => (
                <tr key={g}>
                  <td className="px-3 py-2 text-center font-bold tabular-nums text-accent">{gameNoOf({ cat, table: g })}</td>
                  <td className="px-3 py-2 font-semibold">{g}조</td>
                  {SIDES.map((side) => {
                    const key = slotKey(g, side);
                    const id = board[key];
                    return (
                      <td key={side} className="px-2 py-1.5">
                        <div
                          onDragOver={(e) => { e.preventDefault(); setOver(key); }}
                          onDragLeave={() => setOver((o) => (o === key ? null : o))}
                          onDrop={(e) => { e.preventDefault(); dropOnSlot(key, e.dataTransfer.getData('text/plain')); setOver(null); setDrag(null); }}
                          onClick={() => clickSlot(key)}
                          className={`min-h-[38px] rounded-lg border border-dashed p-0.5 ${over === key ? 'border-accent bg-[#eaf5ff]' : id ? 'border-transparent' : 'border-line'}`}
                        >
                          {id ? chip(id, `slot:${key}`) : <span className="block px-2.5 py-1.5 text-xs text-gray-400">{g}조 · {side}</span>}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-500">진행 순서는 주니어 1조 → 시니어 1조 → 주니어 2조 → … → 시니어 8조로 고정이며, 1R·2R 모두 같습니다. 순서 열은 {CATEGORY_NAMES[cat]} 경기 번호입니다.</p>
    </div>
  );
}
