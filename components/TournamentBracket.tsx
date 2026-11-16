'use client';

import { useState } from 'react';
import ConnectionToast from './ConnectionToast';
import { useRealtime } from '@/lib/realtime/useRealtime';
import { SEED_ORDER, teamName, useContest, type Team, type TournamentGame } from '@/lib/contest';
import { CATEGORY_NAMES, type Category } from '@/lib/judge/rules';

// 8강 토너먼트 대진표 (Figma 92:316): 캔버스 1600 x 1118
// 1열: 8팀(슬롯) → 2열: 8강 승자 4 → 3열: 준결승 승자 2 → 4열: 결승 / 3·4위전
// 관리자 편집 모드에서는 1열 박스가 팀을 끌어다 놓는 점선 슬롯이 된다.
const BW = 256;
const BH = 96;
const W = 1600;
const H = 1118;
const CATEGORIES: Category[] = ['S', 'J'];

type Box = { x: number; y: number };

const mid = (b: Box) => b.y + BH / 2;
const right = (b: Box) => b.x + BW;
const R = 8; // 모서리 둥글기

// 화살표 머리: (x, y) 가 끝점, 왼쪽에서 들어온다
const head = (x: number, y: number) => `M${x - 10} ${y - 8}L${x} ${y}L${x - 10} ${y + 8}`;

// 두 박스가 중괄호(}) 모양으로 모여 다음 박스로 들어가는 연결선
function merge(ya: number, yb: number, sx: number, xv: number, tx: number, ty: number) {
  const tip = xv + 16;
  const half = (y: number, dir: 1 | -1) =>
    `M${sx} ${y}H${xv - R}Q${xv} ${y} ${xv} ${y + dir * R}V${ty - dir * R}Q${xv} ${ty} ${xv + R} ${ty}`;
  return `${half(ya, 1)}${half(yb, -1)}M${xv + R} ${ty}H${tip}M${tip} ${ty}H${tx}${head(tx, ty)}`;
}

const COL = [0, 424, 864, 1344];
const T: Box[] = [0, 158, 318, 446, 606, 734, 894, 1022].map((y) => ({ x: COL[0], y }));
const QF: Box[] = [110, 366, 686, 942].map((y) => ({ x: COL[1], y }));
const SF: Box[] = [254, 830].map((y) => ({ x: COL[2], y }));
const FINAL: Box = { x: COL[3], y: 382 };
const THIRD: Box = { x: COL[3], y: 686 };

const SOLID = [
  ...QF.map((q, i) => merge(mid(T[2 * i]), mid(T[2 * i + 1]), right(T[0]) + 24, right(T[0]) + 72, q.x - 24, mid(q))),
  merge(mid(QF[0]), mid(QF[1]), right(QF[0]) + 24, right(QF[0]) + 72, SF[0].x - 24, mid(SF[0])),
  merge(mid(QF[2]), mid(QF[3]), right(QF[0]) + 24, right(QF[0]) + 72, SF[1].x - 24, mid(SF[1])),
  merge(mid(SF[0]), mid(SF[1]), right(SF[0]) + 64, right(SF[0]) + 112, FINAL.x - 24, mid(FINAL)),
].join('');

// 준결승 패자 → 3·4위전 (파란 점선)
const dx = right(SF[0]) + 40;
const ty3 = mid(THIRD);
const DASHED =
  `M${right(SF[0]) + 24} ${mid(SF[0])}H${dx - R}Q${dx} ${mid(SF[0])} ${dx} ${mid(SF[0]) + R}V${ty3 - R}Q${dx} ${ty3} ${dx + R} ${ty3}H${THIRD.x - 24}` +
  `M${right(SF[1]) + 24} ${mid(SF[1])}H${dx - R}Q${dx} ${mid(SF[1])} ${dx} ${mid(SF[1]) - R}V${ty3 + R}` +
  head(THIRD.x - 24, ty3);

// 8팀 시드 배치는 lib/contest.ts 의 표준 시드를 그대로 쓴다 (1v8, 4v5 / 2v7, 3v6)
export { SEED_ORDER };

export type Seeding = {
  slots: (string | undefined)[]; // 8칸: 2*i, 2*i+1 이 i번째 8강 경기
  onDrop: (slot: number, payload: string) => void; // payload: 'team:ID' | 'slot:N'
  onClear: (slot: number) => void;
  picked?: string; // 터치 환경: 목록에서 선택해 둔 팀
};

// 해당 부문 팀을 합산 점수(1·2차 합) 순으로. 점수가 없는 팀도 0점으로 함께 집계된다.
// 관리자가 순위 조정(rankOrder)을 저장했으면 그 순서를 우선하고, 명단에 빠진 팀은 계산 순위대로 뒤에 붙인다.
export function useRanking(cat: Category) {
  const { standings } = useRealtime();
  const { config } = useContest();
  const teams = config?.teams ?? [];
  const scored = standings.filter((s) => teams.find((t) => t.id === s.teamId)?.cat === cat);
  const merged = scored;
  const order = config?.settings.rankOrder[cat];
  if (!order?.length) return merged;
  const byId = new Map(merged.map((m) => [m.teamId, m]));
  const picked = order.map((id) => byId.get(id)).filter((m) => m !== undefined);
  const rest = merged.filter((m) => !order.includes(m.teamId));
  return [...picked, ...rest];
}

const pos = (b: Box) => ({
  left: `${(b.x / W) * 100}%`,
  top: `${(b.y / H) * 100}%`,
  width: `${(BW / W) * 100}%`,
  height: `${(BH / H) * 100}%`,
});

const BOX = 'absolute flex flex-col items-center justify-center gap-0.5 overflow-hidden rounded border bg-white px-2';

// 박스 한 칸. 저장된 경기 결과가 있으면 승리 팀과 점수를 보여준다.
function Slot({ box, game, teams }: { box: Box; game?: TournamentGame; teams: Team[] }) {
  return (
    <div style={pos(box)} className={`${BOX} border-gray-500`}>
      {game?.status === 'done' && game.winner && (
        <>
          <span className="w-full truncate text-center text-[1.4cqw] font-bold leading-tight text-heading">{teamName(teams, game.winner)}</span>
          <span className="tabular-nums text-[1.2cqw] text-gray-500">{game.scoreA} : {game.scoreB}</span>
        </>
      )}
    </div>
  );
}

// 1열 팀 박스 (보기 모드)
function TeamBox({ box, team, teams }: { box: Box; team?: string; teams: Team[] }) {
  return (
    <div style={pos(box)} className={`${BOX} border-gray-500`}>
      {team && <span className="line-clamp-2 text-center text-[1.4cqw] font-semibold leading-tight text-heading [word-break:keep-all]">{teamName(teams, team)}</span>}
    </div>
  );
}

// 점선 슬롯 한 칸: 팀을 놓는 곳. 놓인 팀은 다시 끌어 옮기거나 누르면 비워진다.
function DropSlot({ i, box, team, teams, seeding }: { i: number; box: Box; team?: string; teams: Team[]; seeding: Seeding }) {
  const [over, setOver] = useState(false);
  return (
    <div
      style={pos(box)}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        seeding.onDrop(i, e.dataTransfer.getData('text/plain'));
      }}
      onClick={() => (seeding.picked ? seeding.onDrop(i, `team:${seeding.picked}`) : team && seeding.onClear(i))}
      draggable={Boolean(team)}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', `slot:${i}`)}
      title={team ? '누르면 비웁니다' : undefined}
      className={`absolute flex items-center justify-center rounded border-2 border-dashed px-2 text-center text-[1.4cqw] font-semibold leading-tight ${
        over ? 'border-accent bg-[#e5f3ff]' : team ? 'cursor-grab border-gray-500 bg-white text-heading' : 'border-gray-300 text-gray-300'
      }`}
    >
      <span className="line-clamp-2 [word-break:keep-all]">{team ? teamName(teams, team) : '팀'}</span>
    </div>
  );
}

export function BracketCanvas({ slots, seeding }: { slots: (string | undefined)[]; seeding?: Seeding }) {
  const { config } = useContest();
  const teams = config?.teams ?? [];
  const games = config?.tournament.games ?? [];
  const gameOf = (round: TournamentGame['round'], gameNo: number) => games.find((x) => x.round === round && x.gameNo === gameNo);
  const label = (b: Box) => ({ left: `${(b.x / W) * 100}%`, top: `${((b.y - 30) / H) * 100}%` });
  return (
    <div className="relative min-w-[900px] [container-type:inline-size]" style={{ aspectRatio: `${W} / ${H}` }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" fill="none" aria-hidden>
        <path d={SOLID} stroke="#6B7280" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <path d={DASHED} stroke="#258EED" strokeWidth={2} strokeDasharray="6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      {T.map((b, i) =>
        seeding ? <DropSlot key={i} i={i} box={b} team={slots[i]} teams={teams} seeding={seeding} /> : <TeamBox key={i} box={b} team={slots[i]} teams={teams} />,
      )}
      {QF.map((b, i) => (
        <Slot key={`q${i}`} box={b} teams={teams} game={gameOf('QF', i + 1)} />
      ))}
      {SF.map((b, i) => (
        <Slot key={`s${i}`} box={b} teams={teams} game={gameOf('SF', i + 1)} />
      ))}
      <Slot box={FINAL} teams={teams} game={gameOf('F', 1)} />
      <Slot box={THIRD} teams={teams} game={gameOf('3P', 1)} />
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
        <BracketCanvas slots={slots} />
      </div>
      <ConnectionToast status={status} />
    </section>
  );
}
