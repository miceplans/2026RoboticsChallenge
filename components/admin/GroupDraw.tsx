'use client';

import { useState } from 'react';
import { useToast } from '@/components/Toast';
import { fieldOfSide, teamName, useContest, refreshContest, type Match, type Side } from '@/lib/contest';
import { CATEGORY_NAMES, type Category } from '@/lib/judge/rules';
import GroupDrawTable, { boardOf, slotKey, SLOT_KEYS, type Board, type Round } from '@/components/GroupDrawTable';
import { adminFetch, btn } from './shared';

// 조 추첨 결과 입력: 공개 '조 추첨' 탭과 같은 표에서 칸마다 팀을 고른다.
// 고르는 즉시 저장되고, 서버가 config 이벤트를 보내 중계 화면이 바로 채워진다.
const CATS: Category[] = ['J', 'S'];

export default function GroupDraw() {
  const toast = useToast();
  const { config } = useContest();
  const teams = config?.teams ?? [];
  const matches = config?.matches ?? [];
  const [round, setRound] = useState<Round>(1);
  const [pending, setPending] = useState<{ cat: Category; round: Round; board: Board } | null>(null); // 저장 중 미리 보여줄 배치
  const busy = pending !== null;

  const boardFor = (cat: Category) => (pending && pending.cat === cat && pending.round === round ? pending.board : boardOf(matches, cat, round));

  // 한 부문·라운드의 배치를 통째로 저장한다. 다른 부문·라운드 줄은 그대로 보낸다.
  const persist = async (cat: Category, board: Board, done?: string) => {
    setPending({ cat, round, board });
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

  // 이미 다른 칸에 있는 팀을 고르면 그 칸에서 옮겨 온다
  const assign = (cat: Category, key: string, team: string) => {
    const b = { ...boardFor(cat) };
    if (team) for (const k of SLOT_KEYS) if (b[k] === team) b[k] = undefined;
    b[key] = team || undefined;
    void persist(cat, b);
  };

  const copyRound1 = async () => {
    if (!confirm('1차 조 배정을 2차에 그대로 복사할까요? (현재 2차 배정은 덮어씁니다)')) return;
    for (const cat of CATS) await persist(cat, boardOf(matches, cat, 1));
    toast('1차 배정을 2차에 복사했습니다.');
  };
  const clearAll = async () => {
    if (!confirm(`${round}차 조 배정을 모두 비울까요? 중계 화면에서도 바로 지워집니다.`)) return;
    for (const cat of CATS) await persist(cat, {});
    toast(`${round}차 조 배정을 비웠습니다.`);
  };

  const tab = (on: boolean) => `px-4 py-2 text-sm font-bold ${on ? 'border-b-2 border-accent text-accent' : 'text-gray-500'}`;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold">조 추첨 배정</h2>
          <p className="mt-1 text-xs text-gray-500">추첨 결과가 나오는 대로 칸에서 팀을 고르세요. 고르는 즉시 저장되고 대회 진행 › 조 추첨 탭에 실시간으로 표시됩니다. 다른 칸에 있던 팀을 고르면 그 칸에서 옮겨 옵니다.</p>
        </div>
        <div className="flex gap-2">
          {round === 2 && <button onClick={copyRound1} disabled={busy} className={`${btn} disabled:opacity-40`}>1차 배정 복사</button>}
          <button onClick={clearAll} disabled={busy} className={`${btn} disabled:opacity-40`}>비우기</button>
        </div>
      </div>

      <nav className="mt-4 flex flex-wrap gap-2 border-b border-line">
        {([1, 2] as Round[]).map((r) => <button key={r} onClick={() => setRound(r)} disabled={busy} className={tab(round === r)}>{r}차 조 추첨</button>)}
        {busy && <span className="ml-auto self-center text-xs text-gray-500">저장 중…</span>}
      </nav>

      <div className="mt-5 grid gap-8 lg:grid-cols-2">
        {CATS.map((cat) => {
          const board = boardFor(cat);
          const catTeams = teams.filter((t) => t.cat === cat).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
          const where = (id: string) => SLOT_KEYS.find((k) => board[k] === id);
          const count = SLOT_KEYS.filter((k) => board[k]).length;
          return (
            <div key={cat}>
              <GroupDrawTable
                cat={cat}
                teamCount={catTeams.length || 16}
                renderTeam={(g, side) => {
                  const key = slotKey(g, side);
                  const id = board[key];
                  return (
                    <select
                      value={id ?? ''}
                      disabled={busy}
                      onChange={(e) => assign(cat, key, e.target.value)}
                      aria-label={`${CATEGORY_NAMES[cat]} ${g}조 ${side} 테이블`}
                      className={`w-full truncate bg-transparent py-0.5 text-sm outline-none ${id ? 'font-semibold text-gray-900' : 'text-gray-400'}`}
                    >
                      <option value="">— 선택 —</option>
                      {catTeams.map((t) => {
                        const at = where(t.id);
                        return (
                          <option key={t.id} value={t.id}>
                            {t.name}{at && at !== key ? ` (현재 ${at.replace('-', '조 ')})` : ''}
                          </option>
                        );
                      })}
                      {id && !catTeams.some((t) => t.id === id) && <option value={id}>{teamName(teams, id)}</option>}
                    </select>
                  );
                }}
              />
              <p className="mt-2 text-right text-xs text-gray-500">{count}/16 배치</p>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-gray-500">진행 순서는 주니어 1조 → 시니어 1조 → 주니어 2조 → … → 시니어 8조로 고정이며, 1차·2차 모두 같습니다.</p>
    </div>
  );
}
