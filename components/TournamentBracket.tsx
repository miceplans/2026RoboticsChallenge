'use client';

import { useState } from 'react';
import ConnectionToast from './ConnectionToast';
import { BH, BW, DASHED, FINAL, H, QF, SF, SOLID, T, THIRD, W } from './bracket/geometry';
import { DropSlot, Slot, TeamBox } from './bracket/BracketBoxes';
import { confirmedPreview, SEED_ORDER, useRanking, type QfPreview, type Seeding } from './bracket/logic';
import { eliminatedTeamIds, useContest, type TournamentGame } from '@/lib/contest';
import { CATEGORY_NAMES, type Category } from '@/lib/judge/rules';
import { useTeamScores } from '@/lib/scores';
import { useRealtime } from '@/lib/realtime/useRealtime';

const CATEGORIES: Category[] = ['S', 'J'];

export function BracketCanvas({ slots, cat, seeding, preview, actions }: { slots: (string | undefined)[]; cat: Category; seeding?: Seeding; preview?: (QfPreview | undefined)[]; actions?: React.ReactNode[] }) {
  const { config } = useContest();
  const { scoreOf: scoreFor } = useTeamScores();
  const games = config?.tournament.games ?? [];
  // 1·2차 점수가 모두 나온 팀만 팀 이름 아래에 점수를 보여준다
  const scoreOf = (id?: string) => {
    const st = scoreFor(id);
    return st?.complete ? st.total : undefined;
  };
  const gameOf = (round: TournamentGame['round'], gameNo: number) => games.find((x) => x.cat === cat && x.round === round && x.gameNo === gameNo);
  const eliminated = eliminatedTeamIds(cat, games);
  // 미리보기에서 진 팀도 탈락 연출
  // (1열의 8강 탈락 연출은 8강 칸 미리보기만 사용)
  for (const pv of (preview ?? []).slice(0, 4)) if (pv) { eliminated.delete(pv.winner); eliminated.add(pv.loser); }
  // 칸에 남아 있는 팀이 다음 경기에서 졌는지: 8강 승자 칸은 준결승 결과로, 준결승 승자 칸은 결승 결과로 본다
  const shown = (i: number, round: TournamentGame['round'], gameNo: number) => preview?.[i]?.winner ?? gameOf(round, gameNo)?.winner ?? undefined;
  const lostNext = (team: string | undefined, next: QfPreview | undefined) => Boolean(team && next && next.loser === team);
  const label = (b: { x: number; y: number }) => ({ left: `${(b.x / W) * 100}%`, top: `${((b.y - 30) / H) * 100}%` });
  return (
    <div className="relative min-w-[900px] [container-type:inline-size]" style={{ aspectRatio: `${W} / ${H}` }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" fill="none" aria-hidden>
        <path d={SOLID} stroke="#757575" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        <path d={DASHED} stroke="#258EED" strokeWidth={4} strokeDasharray="8 8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      {T.map((b, i) =>
        seeding ? <DropSlot key={i} i={i} box={b} team={slots[i]} seeding={seeding} score={scoreOf(slots[i])} /> : <TeamBox key={i} box={b} team={slots[i]} eliminated={Boolean(slots[i] && eliminated.has(slots[i]!))} score={scoreOf(slots[i])} />,
      )}
      {QF.map((b, i) => (
        <Slot key={`${cat}-q${i}`} box={b} game={gameOf('QF', i + 1)} preview={preview?.[i]} out={lostNext(shown(i, 'QF', i + 1), preview?.[4 + (i >> 1)])} />
      ))}
      {SF.map((b, i) => (
        <Slot key={`${cat}-s${i}`} box={b} game={gameOf('SF', i + 1)} preview={preview?.[4 + i]} out={lostNext(shown(4 + i, 'SF', i + 1), preview?.[6])} />
      ))}
      <Slot key={`${cat}-f`} box={FINAL} game={gameOf('F', 1)} preview={preview?.[6]} />
      <Slot key={`${cat}-t`} box={THIRD} game={gameOf('3P', 1)} preview={preview?.[7]} />
      {actions?.map((node, i) => {
        const b = [...QF, ...SF, FINAL, THIRD][i];
        return node ? (
          <div key={`act${i}`} style={{ left: `${(b.x / W) * 100}%`, top: `${((b.y + BH + 8) / H) * 100}%`, width: `${(BW / W) * 100}%` }} className="absolute z-10 flex flex-wrap items-center gap-x-[0.5cqw] gap-y-[0.4cqw]">
            {node}
          </div>
        ) : null;
      })}
      <p style={label(FINAL)} className="absolute text-[1.4cqw] font-bold text-accent">
        결승
      </p>
      <p style={label(THIRD)} className="absolute text-[1.4cqw] font-medium text-gray-500">
        3·4위전
      </p>
    </div>
  );
}

export default function TournamentBracket({ switcher }: { switcher?: React.ReactNode }) {
  const { status } = useRealtime();
  const { config } = useContest();
  const [cat, setCat] = useState<Category>('S');
  const ranked = useRanking(cat).slice(0, 8).map((s) => s.teamId);
  // 관리자가 저장한 배정이 있으면 그것을 보여주고, 없으면 예선 순위 기반 시드 배치를 보여준다
  const saved = config?.tournament.slots.filter((s) => s.cat === cat).sort((a, b) => a.slotNo - b.slotNo) ?? [];
  const slots = saved.length === 8 && saved.some((s) => s.teamId) ? saved.map((s) => s.teamId ?? undefined) : SEED_ORDER.map((seed) => ranked[seed - 1]);

  return (
    <section className="mx-auto min-h-screen max-w-[1280px] px-6 pt-[121px] pb-24">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-extrabold text-heading [word-break:keep-all]">대회 진행</h1>
        {switcher}
      </div>
      <nav className="flex gap-2 border-b border-line">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`px-4 py-3 text-base font-bold ${cat === c ? 'border-b-2 border-accent text-accent' : 'text-gray-500'}`}
          >
            {CATEGORY_NAMES[c]}
          </button>
        ))}
      </nav>
      <div className="mt-8 overflow-x-auto">
        <BracketCanvas slots={slots} cat={cat} preview={confirmedPreview(config?.tournament.games ?? [], cat)} />
      </div>
      <ConnectionToast status={status} />
    </section>
  );
}
