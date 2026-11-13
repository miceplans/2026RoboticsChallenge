'use client';

import { useState } from 'react';
import ConnectionToast from './ConnectionToast';
import { useRealtime } from '@/lib/realtime/useRealtime';
import { SEED_ORDER, teamName, useContest, type Team, type TournamentGame } from '@/lib/contest';
import { CATEGORY_NAMES, type Category } from '@/lib/judge/rules';

// 8강 토너먼트 대진표: 캔버스 1000 x 760
// 박스 하나가 한 경기(팀 2개)이고 박스 안에는 승리한 팀이 들어간다.
// 8강 4경기(8팀) → 준결승 2경기 → 결승 / 3·4위전(준결승 패자전)
const BW = 256;
const BH = 96;
const CATEGORIES: Category[] = ['S', 'J'];
// 관리자 편집 모드: 왼쪽에 팀을 끌어다 놓는 점선 슬롯 열(OX)을 추가한다
const OX = 480;
const PW = 408; // 슬롯 한 쌍(한 경기)의 너비

type Box = { x: number; y: number };

const mid = (b: Box) => b.y + BH / 2;
const right = (b: Box) => b.x + BW;

// 두 경기 박스가 다음 박스로 모이는 괄호 모양 연결선
function merge(a: Box, b: Box, to: Box) {
  const x1 = right(a) + 8;
  const xm = (x1 + to.x - 16) / 2 + 8;
  const ty = mid(to);
  return (
    `M${x1} ${mid(a)}H${xm}V${ty}M${x1} ${mid(b)}H${xm}V${ty}M${xm} ${ty}H${to.x - 12}` +
    `M${to.x - 22} ${ty - 8}L${to.x - 12} ${ty}L${to.x - 22} ${ty + 8}`
  );
}

// 준결승 패자 → 3·4위전
function loser(a: Box, to: Box) {
  const x1 = right(a) + 8;
  const xm = x1 + 16 + (a.y < to.y ? 0 : 12);
  const ty = mid(to);
  return `M${x1} ${mid(a)}H${xm}V${ty}H${to.x - 12}` + `M${to.x - 22} ${ty - 8}L${to.x - 12} ${ty}L${to.x - 22} ${ty + 8}`;
}

// 8강 토너먼트 좌표: 캔버스 1000 x 760 (+ 편집 모드의 왼쪽 슬롯 열)
function geometry(ox: number) {
  const QF: Box[] = [84, 240, 424, 580].map((y) => ({ x: ox, y }));
  const SF: Box[] = [162, 502].map((y) => ({ x: ox + 360, y }));
  const FINAL: Box = { x: ox + 720, y: 332 };
  const THIRD: Box = { x: ox + 720, y: 560 };
  const SOLID = [merge(QF[0], QF[1], SF[0]), merge(QF[2], QF[3], SF[1]), merge(SF[0], SF[1], FINAL)].join('');
  return { W: 1000 + ox, H: 760, QF, SF, FINAL, THIRD, SOLID, DASHED: loser(SF[0], THIRD) + loser(SF[1], THIRD) };
}
const GEO = { view: geometry(0), edit: geometry(OX) };

// 8팀 시드 배치는 lib/contest.ts 의 표준 시드를 그대로 쓴다 (1v8, 4v5 / 2v7, 3v6)
export { SEED_ORDER };

export type Seeding = {
  slots: (string | undefined)[]; // 8칸: 2*i, 2*i+1 이 i번째 8강 경기
  onDrop: (slot: number, payload: string) => void; // payload: 'team:ID' | 'slot:N'
  onClear: (slot: number) => void;
  picked?: string; // 터치 환경: 목록에서 선택해 둔 팀
};

// 해당 부문 팀을 합산 점수(1·2차 합) 순으로. 점수가 없는 팀은 목록에 올리지 않는다.
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

// 점수 슬롯 한 칸. 저장된 경기 결과가 있으면 승리 팀과 점수를 보여준다.
function Slot({ box, strong, game, teams, g }: { box: Box; strong?: boolean; game?: TournamentGame; teams: Team[]; g: ReturnType<typeof geometry> }) {
  return (
    <div style={pos(box, g)} className={`absolute flex flex-col items-center justify-center gap-0.5 overflow-hidden rounded border bg-white px-1 ${strong ? 'border-accent' : 'border-line'}`}>
      {game?.status === 'done' && game.winner && (
        <>
          <span className="w-full truncate text-center text-[1.1cqw] font-bold leading-tight text-heading">{teamName(teams, game.winner)}</span>
          <span className="tabular-nums text-[1cqw] text-gray-500">{game.scoreA} : {game.scoreB}</span>
        </>
      )}
    </div>
  );
}

const pos = (b: Box, g: { W: number; H: number }, w = BW) => ({
  left: `${(b.x / g.W) * 100}%`,
  top: `${(b.y / g.H) * 100}%`,
  width: `${(w / g.W) * 100}%`,
  height: `${(BH / g.H) * 100}%`,
});

// 점선 슬롯 한 칸: 팀을 놓는 곳. 놓인 팀은 다시 끌어 옮기거나 누르면 비워진다.
function DropSlot({ i, team, teams, seeding }: { i: number; team?: string; teams: Team[]; seeding: Seeding }) {
  const [over, setOver] = useState(false);
  return (
    <div
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
      className={`flex h-full flex-1 items-center justify-center rounded border-2 border-dashed px-2 text-center text-[1.2cqw] font-semibold leading-tight ${
        over ? 'border-accent bg-white' : team ? 'cursor-grab border-transparent bg-white text-heading' : 'border-gray-300 text-gray-300'
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
  const g = seeding ? GEO.edit : GEO.view;
  const { W, H, QF, SF, FINAL, THIRD, SOLID, DASHED } = g;
  const pct = (b: Box, dy = 0) => ({ left: `${(b.x / W) * 100}%`, top: `${((b.y + dy) / H) * 100}%` });
  return (
    <div className={`relative [container-type:inline-size] ${seeding ? 'min-w-[1000px]' : 'min-w-[700px]'}`} style={{ aspectRatio: `${W} / ${H}` }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" fill="none" aria-hidden>
        <path d={SOLID} stroke="#6B7280" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        <path d={DASHED} stroke="#258EED" strokeWidth={3} strokeDasharray="10 8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      {seeding &&
        QF.map((b, i) => (
          <div
            key={i}
            style={{ left: 0, top: `${(b.y / H) * 100}%`, width: `${(PW / W) * 100}%`, height: `${(BH / H) * 100}%` }}
            className="absolute flex gap-[2%] rounded bg-[#e5f3ff] p-[1.3%]"
          >
            <DropSlot i={2 * i} team={slots[2 * i]} teams={teams} seeding={seeding} />
            <DropSlot i={2 * i + 1} team={slots[2 * i + 1]} teams={teams} seeding={seeding} />
          </div>
        ))}

      {QF.map((b, i) => (
        <p key={i} style={pct(b, -30)} className="absolute whitespace-nowrap text-[1.1cqw] font-medium leading-none text-gray-500">
          {slots[2 * i] ? teamName(teams, slots[2 * i]!) : '-'} vs {slots[2 * i + 1] ? teamName(teams, slots[2 * i + 1]!) : '-'}
        </p>
      ))}

      {[...QF, ...SF].map((b, i) => (
        <Slot key={i} box={b} g={g} teams={teams} game={i < 4 ? gameOf('QF', i + 1) : gameOf('SF', i - 3)} />
      ))}
      <Slot box={FINAL} strong g={g} teams={teams} game={gameOf('F', 1)} />
      <Slot box={THIRD} g={g} teams={teams} game={gameOf('3P', 1)} />
      <p style={pct(QF[0], -58)} className="absolute whitespace-nowrap text-[1.1cqw] font-medium leading-none text-gray-500">
        8강
      </p>
      <p style={pct(SF[0], -58)} className="absolute whitespace-nowrap text-[1.1cqw] font-medium leading-none text-gray-500">
        준결승
      </p>
      <p style={pct(FINAL, -37)} className="absolute text-[1.2cqw] font-bold text-accent">
        결승
      </p>
      <p style={pct(THIRD, -37)} className="absolute text-[1.2cqw] font-medium text-gray-500">
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
