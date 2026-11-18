'use client';

import { useState } from 'react';
import ConnectionToast from './ConnectionToast';
import { FINAL, H, HEADS, LINES, PLACES, QF, SF, T, TAGS, THIRD, THIRD_LABEL_Y, TITLE, W, pos } from './bracket/geometry';
import { DropSlot, SeedTag, Slot, TeamBox } from './bracket/BracketBoxes';
import { confirmedPreview, SEED_ORDER, useRanking, type QfPreview, type Seeding } from './bracket/logic';
import { BRACKET_THEME } from './bracket/theme';
import Score from './team/Score';
import TeamName from './team/TeamName';
import { eliminatedTeamIds, useContest, type TournamentGame } from '@/lib/contest';
import { CATEGORY_NAMES, type Category } from '@/lib/judge/rules';
import { useTeamScores } from '@/lib/scores';
import { useRealtime } from '@/lib/realtime/useRealtime';

const CATEGORIES: Category[] = ['J', 'S'];

export function BracketCanvas({ slots, cat, seeding, preview, actions }: { slots: (string | undefined)[]; cat: Category; seeding?: Seeding; preview?: (QfPreview | undefined)[]; actions?: React.ReactNode[] }) {
  const { config } = useContest();
  const { scoreOf: scoreFor } = useTeamScores();
  const theme = BRACKET_THEME[cat];
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
  // 칸에 남아 있는 팀이 다음 경기에서 졌는지: 4강 칸은 준결승 결과로, 결승 칸은 결승 결과로 본다
  const shown = (i: number, round: TournamentGame['round'], gameNo: number) => preview?.[i]?.winner ?? gameOf(round, gameNo)?.winner ?? undefined;
  const lostNext = (team: string | undefined, next: QfPreview | undefined) => Boolean(team && next && next.loser === team);
  // 3·4위전: 준결승 패자 두 팀, 결과가 나오면 3위·4위
  const third = gameOf('3P', 1);
  const thirdTeams = [third?.teamA ?? preview?.[4]?.loser, third?.teamB ?? preview?.[5]?.loser];
  const thirdDone = third?.status === 'done' && third.winner ? { winner: third.winner, loser: third.winner === third.teamA ? third.teamB : third.teamA } : undefined;
  const thirdResult = preview?.[7] ?? thirdDone;
  const places = [thirdResult?.winner, thirdResult?.loser ?? undefined];
  const actionBoxes = [...QF, ...SF, FINAL, THIRD[1]];
  const at = (x: number, y: number) => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` });
  return (
    <div className="relative min-w-[720px] [container-type:inline-size]" style={{ aspectRatio: `${W} / ${H}` }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" fill="none" aria-hidden>
        <path d={LINES} stroke={theme.line} strokeWidth={1.5} strokeLinejoin="miter" />
      </svg>

      <div style={{ ...pos(TITLE), backgroundColor: theme.main }} className="absolute flex items-center justify-center rounded-[0.9cqw] text-[2.3cqw] font-extrabold text-white">
        {CATEGORY_NAMES[cat]} 토너먼트
      </div>
      {HEADS.map((h) => (
        <p key={h.label} style={{ ...at(h.cx, h.y), color: theme.main }} className="absolute -translate-x-1/2 text-[2.1cqw] font-extrabold leading-none">
          {h.label}
        </p>
      ))}

      {TAGS.map((b, i) => (
        <SeedTag key={`tag${i}`} box={b} seed={SEED_ORDER[i]} theme={theme} />
      ))}
      {T.map((b, i) => {
        const score = scoreOf(slots[i]);
        return seeding ? (
          <DropSlot key={i} i={i} box={b} team={slots[i]} seeding={seeding} score={score} />
        ) : (
          <TeamBox key={i} box={b} team={slots[i]} eliminated={Boolean(slots[i] && eliminated.has(slots[i]!))} score={score !== undefined ? <Score value={score} /> : undefined} theme={theme} />
        );
      })}
      {QF.map((b, i) => (
        <Slot key={`${cat}-q${i}`} box={b} theme={theme} game={gameOf('QF', i + 1)} preview={preview?.[i]} out={lostNext(shown(i, 'QF', i + 1), preview?.[4 + (i >> 1)])} />
      ))}
      {SF.map((b, i) => (
        <Slot key={`${cat}-s${i}`} box={b} theme={theme} game={gameOf('SF', i + 1)} preview={preview?.[4 + i]} out={lostNext(shown(4 + i, 'SF', i + 1), preview?.[6])} />
      ))}
      <Slot key={`${cat}-f`} box={FINAL} theme={theme} title="우승" game={gameOf('F', 1)} preview={preview?.[6]} />

      <p style={{ ...at(THIRD[0].x, THIRD_LABEL_Y), color: theme.main }} className="absolute text-[1.9cqw] font-extrabold leading-none">
        3 · 4위전
      </p>
      {THIRD.map((b, i) => (
        <TeamBox key={`${cat}-t${i}`} box={b} team={thirdTeams[i] ?? undefined} eliminated={false} theme={theme} />
      ))}
      {PLACES.map((p, i) => (
        <p key={p.label} style={{ ...at(p.x, p.y), color: theme.main, width: `${((W - p.x) / W) * 100}%` }} className="absolute flex items-end gap-[0.6cqw] text-[1.9cqw] font-extrabold leading-tight">
          <span className="shrink-0">{p.label}</span>
          <span style={{ borderColor: theme.main }} className="min-w-[14cqw] truncate border-b-2 px-[0.4cqw] text-[1.6cqw] font-bold text-heading">
            {places[i] ? <TeamName id={places[i]!} /> : '\u00a0'}
          </span>
        </p>
      ))}

      {actions?.map((node, i) => {
        const b = actionBoxes[i];
        return node ? (
          <div key={`act${i}`} style={{ left: `${(b.x / W) * 100}%`, top: `${((b.y + b.h + 4) / H) * 100}%`, width: `${(b.w / W) * 100}%` }} className="absolute z-10 flex flex-wrap items-center gap-x-[0.5cqw] gap-y-[0.4cqw]">
            {node}
          </div>
        ) : null;
      })}
    </div>
  );
}

export default function TournamentBracket({ switcher }: { switcher?: React.ReactNode }) {
  const { status } = useRealtime();
  const { config } = useContest();
  const [cat, setCat] = useState<Category>('J');
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
            style={cat === c ? { color: BRACKET_THEME[c].main, borderColor: BRACKET_THEME[c].main } : undefined}
            className={`px-4 py-3 text-base font-bold ${cat === c ? 'border-b-2' : 'text-gray-500'}`}
          >
            {CATEGORY_NAMES[c]}
          </button>
        ))}
      </nav>
      <div className="mx-auto mt-8 max-w-[1000px] overflow-x-auto">
        <BracketCanvas slots={slots} cat={cat} preview={confirmedPreview(config?.tournament.games ?? [], cat)} />
      </div>
      <ConnectionToast status={status} />
    </section>
  );
}
