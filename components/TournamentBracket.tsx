'use client';

import { useState } from 'react';
import ConnectionToast from './ConnectionToast';
import { useRealtime } from '@/lib/realtime/useRealtime';
import { eliminatedTeamIds, SEED_ORDER, teamName, useContest, type Team, type TournamentGame } from '@/lib/contest';
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

const COL = [0, 424, 864, 1344];
const T: Box[] = [0, 158, 318, 446, 606, 734, 894, 1022].map((y) => ({ x: COL[0], y }));
const QF: Box[] = [110, 366, 686, 942].map((y) => ({ x: COL[1], y }));
const SF: Box[] = [254, 830].map((y) => ({ x: COL[2], y }));
const FINAL: Box = { x: COL[3], y: 382 };
const THIRD: Box = { x: COL[3], y: 686 };

// Figma 커넥터(엘보 + 화살표 선, 굵기 4)를 그대로 옮긴 연결선.
// [시작 x, 시작 y, 끝 x, 끝 y, 세로선 위치(시작점 기준)] — 좌표는 Figma 섹션 기준에서 (941, 564)를 뺀 값
const OX = 941;
const OY = 564;
type Conn = [number, number, number, number, number];
const c = (sx: number, sy: number, ex: number, ey: number, vx?: number): Conn => [sx - OX, sy - OY, ex - OX, ey - OY, vx ?? (ey > sy ? 52.5 : 50)];

const SOLID_CONNS: Conn[] = [
  c(1221, 634, 1341, 702), c(1221, 770, 1341, 702),
  c(1221, 930, 1341, 998), c(1221, 1066, 1341, 998),
  c(1221, 1230, 1341, 1298), c(1221, 1366, 1341, 1298),
  c(1221, 1506, 1341, 1574), c(1221, 1642, 1341, 1574),
  c(1645, 722, 1765, 850), c(1645, 978, 1765, 850),
  c(1645, 1298, 1765, 1426), c(1645, 1554, 1765, 1426),
  c(2125, 850, 2245, 978), c(2125, 1458, 2245, 978),
];
// 준결승 패자 → 3·4위전 (파란 점선)
const DASHED_CONNS: Conn[] = [c(2101, 850, 2244, 1298, 45), c(2124, 1458, 2244, 1298, 22)];

// 모서리가 둥근 엘보 선 + ARROW_LINES 화살표(끝점에서 45° 로 12.73 씩 벌어지는 ㅅ자)
function elbow([sx, sy, ex, ey, vx]: Conn) {
  const down = ey > sy;
  const x = sx + vx;
  const r1 = Math.min(24, vx, Math.abs(ey - sy) / 2);
  const r2 = Math.min(24, ex - x, Math.abs(ey - sy) / 2);
  const d = down ? 1 : -1;
  const A = 12.728;
  return (
    `M${sx} ${sy}H${x - r1}Q${x} ${sy} ${x} ${sy + d * r1}V${ey - d * r2}Q${x} ${ey} ${x + r2} ${ey}H${ex}` +
    `M${ex - A} ${ey - A}L${ex} ${ey}L${ex - A} ${ey + A}`
  );
}
const SOLID = SOLID_CONNS.map(elbow).join('');
const DASHED = DASHED_CONNS.map(elbow).join('');

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
function TeamBox({ box, team, teams, eliminated }: { box: Box; team?: string; teams: Team[]; eliminated: boolean }) {
  return (
    <div style={pos(box)} className={`${BOX} overflow-visible border-gray-500 ${eliminated ? 'bracket-eliminated' : ''}`}>
      {eliminated && (
        <span className="bracket-smoke" aria-hidden>
          <i /><i /><i />
        </span>
      )}
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

export function BracketCanvas({ slots, cat, seeding }: { slots: (string | undefined)[]; cat: Category; seeding?: Seeding }) {
  const { config } = useContest();
  const teams = config?.teams ?? [];
  const games = config?.tournament.games ?? [];
  const gameOf = (round: TournamentGame['round'], gameNo: number) => games.find((x) => x.cat === cat && x.round === round && x.gameNo === gameNo);
  const eliminated = eliminatedTeamIds(cat, games);
  const label = (b: Box) => ({ left: `${(b.x / W) * 100}%`, top: `${((b.y - 30) / H) * 100}%` });
  return (
    <div className="relative min-w-[900px] [container-type:inline-size]" style={{ aspectRatio: `${W} / ${H}` }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" fill="none" aria-hidden>
        <path d={SOLID} stroke="#757575" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        <path d={DASHED} stroke="#258EED" strokeWidth={4} strokeDasharray="8 8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      {T.map((b, i) =>
        seeding ? <DropSlot key={i} i={i} box={b} team={slots[i]} teams={teams} seeding={seeding} /> : <TeamBox key={i} box={b} team={slots[i]} teams={teams} eliminated={Boolean(slots[i] && eliminated.has(slots[i]!))} />,
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
        <BracketCanvas slots={slots} cat={cat} />
      </div>
      <ConnectionToast status={status} />
    </section>
  );
}
