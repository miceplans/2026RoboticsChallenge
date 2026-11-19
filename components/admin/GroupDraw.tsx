'use client';

import { useState } from 'react';
import { useToast } from '@/components/Toast';
import { fieldOfSide, teamName, useContest, refreshContest, type Match, type Side } from '@/lib/contest';
import { CATEGORY_NAMES, type Category } from '@/lib/judge/rules';
import GroupDrawTable, { boardOf, DRAW_THEME, slotKey, SLOT_KEYS, type Board, type Round } from '@/components/GroupDrawTable';
import { adminFetch, btn } from './shared';

// 조 추첨 결과 입력: 공개 '조 추첨' 탭과 같은 표에 팀을 끌어다 놓는다.
// 놓는 즉시 저장되고, 서버가 config 이벤트를 보내 중계 화면이 바로 채워진다.
// 칸끼리 끌면 자리가 바뀌고, 칸에서 대기 팀으로 끌면 빠진다. (터치: 팀을 누른 뒤 칸을 누른다)
const CATS: Category[] = ['J', 'S'];
type Boards = Partial<Record<Category, Board>>;
// 끄는 대상: 부문|team:팀ID 또는 부문|slot:칸키
type Src = { cat: Category; kind: 'team' | 'slot'; val: string };
const enc = (s: Src) => `${s.cat}|${s.kind}:${s.val}`;
function dec(raw: string): Src | null {
  const m = /^([JS])\|(team|slot):(.+)$/.exec(raw);
  return m ? { cat: m[1] as Category, kind: m[2] as Src['kind'], val: m[3] } : null;
}

export default function GroupDraw() {
  const toast = useToast();
  const { config } = useContest();
  const teams = config?.teams ?? [];
  const matches = config?.matches ?? [];
  const [round, setRound] = useState<Round>(1);
  const [pending, setPending] = useState<{ round: Round; boards: Boards } | null>(null); // 저장 중 미리 보여줄 배치
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null); // 터치용: 먼저 누른 팀/칸
  const busy = pending !== null;

  const boardFor = (cat: Category) => (pending?.round === round && pending.boards[cat]) || boardOf(matches, cat, round);

  // 바뀐 부문들의 배치를 한 번의 요청으로 저장한다. 나머지 부문·라운드 줄은 그대로 보낸다.
  const persist = async (boards: Boards, r: Round = round, done?: string) => {
    setPending({ round: r, boards });
    try {
      const changed = Object.keys(boards) as Category[];
      // 같은 팀·라운드의 기존 경기 ID 를 유지해야 이미 들어온 점수(scores FK)가 끊기지 않는다
      const idOf = (team: string) => matches.find((m) => m.round === r && m.team === team)?.id ?? `R${r}-${team}`;
      const others = matches.filter((m) => !(m.round === r && changed.includes(m.cat)));
      const mine: Match[] = changed.flatMap((cat) =>
        SLOT_KEYS.flatMap((k) => {
          const team = boards[cat]![k];
          if (!team) return [];
          const [g, side] = k.split('-') as [string, Side];
          return [{ id: idOf(team), round: r, cat, wave: side, table: Number(g), field: fieldOfSide(side), team }];
        }),
      );
      const all = [...others, ...mine].map(({ id, round, cat, wave, table, field, team }) => ({ id, round, cat, wave, table, field, team }));
      await adminFetch('/admin/matches', { method: 'PUT', body: { matches: all } });
      await refreshContest();
      if (done) toast(done);
    } catch (e) {
      const msg = (e as Error).message;
      toast(msg === 'matches_in_use' ? '이미 점수가 들어온 팀은 배정에서 뺄 수 없습니다. (칸 이동은 가능)' : msg.startsWith('slot_taken:') ? `한 칸에 두 팀이 배정돼 있습니다 (${msg.slice(11)}). 새로고침 후 다시 시도해 주세요.` : msg);
    } finally {
      setPending(null);
    }
  };

  // 칸에 놓기: 칸끼리는 자리를 바꾸고, 대기 팀을 놓으면 원래 그 칸의 팀은 대기 팀으로 돌아간다
  const dropOnSlot = (cat: Category, key: string, raw: string | null) => {
    const src = raw ? dec(raw) : null;
    if (!src || src.cat !== cat || busy) return;
    const b = { ...boardFor(cat) };
    if (src.kind === 'slot') {
      if (src.val === key) return;
      [b[src.val], b[key]] = [b[key], b[src.val]];
    } else {
      for (const k of SLOT_KEYS) if (b[k] === src.val) b[k] = undefined;
      b[key] = src.val;
    }
    void persist({ [cat]: b });
  };
  const dropOnPool = (cat: Category, raw: string | null) => {
    const src = raw ? dec(raw) : null;
    if (!src || src.cat !== cat || src.kind !== 'slot' || busy) return;
    void persist({ [cat]: { ...boardFor(cat), [src.val]: undefined } });
  };
  const clickSlot = (cat: Category, key: string) => {
    const board = boardFor(cat);
    if (picked && dec(picked)?.cat === cat) {
      dropOnSlot(cat, key, picked);
      setPicked(null);
    } else if (board[key]) setPicked(enc({ cat, kind: 'slot', val: key }));
  };

  const copyRound1 = () => {
    if (!confirm('1차 조 배정을 2차에 그대로 복사할까요? (현재 2차 배정은 덮어씁니다)')) return;
    void persist({ J: boardOf(matches, 'J', 1), S: boardOf(matches, 'S', 1) }, 2, '1차 배정을 2차에 복사했습니다.');
  };
  const clearAll = () => {
    if (!confirm(`${round}차 조 배정을 주니어·시니어 모두 비울까요? 중계 화면에서도 바로 지워집니다.`)) return;
    void persist({ J: {}, S: {} }, round, `${round}차 조 배정을 비웠습니다.`);
  };

  const chip = (cat: Category, id: string, from: string) => (
    <span
      draggable={!busy}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', from); setDrag(from); }}
      onDragEnd={() => { setDrag(null); setOver(null); }}
      className={`block cursor-grab truncate rounded-md border bg-white px-2 py-0.5 text-sm font-semibold text-gray-900 ${picked === from ? 'ring-2' : ''} ${drag === from ? 'opacity-40' : ''}`}
      style={{ borderColor: picked === from ? DRAW_THEME[cat].head : '#dde2e9', ['--tw-ring-color' as string]: `${DRAW_THEME[cat].head}55` }}
      title={`${teamName(teams, id)} (${id})`}
    >
      {teamName(teams, id)}
    </span>
  );

  const tab = (on: boolean) => `px-4 py-2 text-sm font-bold ${on ? 'border-b-2 border-accent text-accent' : 'text-gray-500'}`;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold">조 추첨 배정</h2>
          <p className="mt-1 text-xs text-gray-500">추첨 결과가 나오는 대로 대기 팀을 표의 칸에 끌어다 놓으세요. 놓는 즉시 저장되고 대회 진행 › 조 추첨 탭에 실시간으로 표시됩니다. 칸끼리 끌면 자리가 바뀌고, 칸에서 대기 팀으로 끌면 빠집니다. (터치: 팀을 누른 뒤 칸을 누르세요)</p>
        </div>
        <div className="flex gap-2">
          {round === 2 && <button onClick={copyRound1} disabled={busy} className={`${btn} disabled:opacity-40`}>1차 배정 복사</button>}
          <button onClick={clearAll} disabled={busy} className={`${btn} disabled:opacity-40`}>비우기</button>
        </div>
      </div>

      <nav className="mt-4 flex flex-wrap gap-2 border-b border-line">
        {([1, 2] as Round[]).map((r) => <button key={r} onClick={() => { setRound(r); setPicked(null); }} disabled={busy} className={tab(round === r)}>{r}차 조 추첨</button>)}
        {busy && <span className="ml-auto self-center text-xs text-gray-500">저장 중…</span>}
      </nav>

      <div className="mt-5 grid gap-8 lg:grid-cols-2">
        {CATS.map((cat) => {
          const board = boardFor(cat);
          const placed = new Set(Object.values(board).filter(Boolean));
          const pool = teams.filter((t) => t.cat === cat && !placed.has(t.id)).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
          const count = SLOT_KEYS.filter((k) => board[k]).length;
          const t = DRAW_THEME[cat];
          return (
            <div key={cat}>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); dropOnPool(cat, e.dataTransfer.getData('text/plain')); setDrag(null); }}
                onClick={() => { const s = picked ? dec(picked) : null; if (s?.cat === cat && s.kind === 'slot') { dropOnPool(cat, picked); setPicked(null); } }}
                className="mb-4 rounded-xl p-3"
                style={{ background: `${t.soft}99` }}
              >
                <div className="flex items-center justify-between text-sm"><b style={{ color: t.text }}>{CATEGORY_NAMES[cat]} 대기 팀</b><span className="text-xs text-gray-500">{count}/16 배치</span></div>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {pool.map((tm) => {
                    const from = enc({ cat, kind: 'team', val: tm.id });
                    return (
                      <li key={tm.id} className="max-w-[48%]" onClick={(e) => { e.stopPropagation(); setPicked((p) => (p === from ? null : from)); }}>
                        {chip(cat, tm.id, from)}
                      </li>
                    );
                  })}
                  {pool.length === 0 && <li className="w-full py-2 text-center text-xs text-gray-500">모든 팀이 배치됐습니다.</li>}
                </ul>
              </div>
              <GroupDrawTable
                cat={cat}
                teamCount={teams.filter((x) => x.cat === cat).length || 16}
                renderTeam={(g, side) => {
                  const key = slotKey(g, side);
                  const id = board[key];
                  const overKey = `${cat}-${key}`;
                  return (
                    <div
                      onDragOver={(e) => { e.preventDefault(); setOver(overKey); }}
                      onDragLeave={() => setOver((o) => (o === overKey ? null : o))}
                      onDrop={(e) => { e.preventDefault(); dropOnSlot(cat, key, e.dataTransfer.getData('text/plain')); setOver(null); setDrag(null); }}
                      onClick={() => clickSlot(cat, key)}
                      className="-mx-2 min-h-[26px] rounded px-1 py-0.5"
                      style={over === overKey ? { background: t.soft } : undefined}
                    >
                      {id ? chip(cat, id, enc({ cat, kind: 'slot', val: key })) : <span className="block px-1 text-xs text-gray-300">여기에 놓기</span>}
                    </div>
                  );
                }}
              />
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-gray-500">진행 순서는 주니어 1조 → 시니어 1조 → 주니어 2조 → … → 시니어 8조로 고정이며, 1차·2차 모두 같습니다.</p>
    </div>
  );
}
