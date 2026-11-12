'use client';

import { useState } from 'react';
import ConnectionToast from './ConnectionToast';
import { useRealtime } from '@/lib/realtime/useRealtime';
import { TEAMS, teamName } from '@/lib/judge/data';
import { CATEGORY_NAMES, type Category } from '@/lib/judge/rules';

// 피그마 대진표(8강 토너먼트) 좌표를 그대로 옮긴 것: 캔버스 1600 x 1129
// 박스 하나가 한 경기(팀 2개)이고 박스 안에는 승리한 팀이 들어간다.
// 1라운드 8경기(16팀) → 준결승 2경기 → 결승 / 3·4위전(패자전)
const BW = 256;
const BH = 96;
const CATEGORIES: Category[] = ['S', 'J'];
const useMock = process.env.NODE_ENV !== 'production';
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

// 피그마 대진표(8강 토너먼트) 좌표: 캔버스 1600 x 1129 (+ 편집 모드의 왼쪽 슬롯 열)
function geometry(ox: number) {
  const R1: Box[] = [41, 169, 329, 457, 617, 745, 905, 1033].map((y) => ({ x: ox, y }));
  const R2: Box[] = [121, 377, 697, 953].map((y) => ({ x: ox + 424, y }));
  const R3: Box[] = [265, 841].map((y) => ({ x: ox + 864, y }));
  const FINAL: Box = { x: ox + 1344, y: 393 };
  const THIRD: Box = { x: ox + 1344, y: 697 };
  const SOLID = [
    merge(R1[0], R1[1], R2[0]),
    merge(R1[2], R1[3], R2[1]),
    merge(R1[4], R1[5], R2[2]),
    merge(R1[6], R1[7], R2[3]),
    merge(R2[0], R2[1], R3[0]),
    merge(R2[2], R2[3], R3[1]),
    merge(R3[0], R3[1], FINAL),
  ].join('');
  return { W: 1600 + ox, H: 1129, R1, R2, R3, FINAL, THIRD, SOLID, DASHED: loser(R3[0], THIRD) + loser(R3[1], THIRD) };
}
const GEO = { view: geometry(0), edit: geometry(OX) };

// 16팀 시드 배치: 상위 시드끼리 결승까지 만나지 않도록 (1v16, 8v9, 4v13, 5v12, 2v15, 7v10, 3v14, 6v11)
export const SEED_ORDER = [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11];

export type Seeding = {
  slots: (string | undefined)[]; // 16칸: 2*i, 2*i+1 이 i번째 1라운드 경기
  onDrop: (slot: number, payload: string) => void; // payload: 'team:ID' | 'slot:N'
  onClear: (slot: number) => void;
  picked?: string; // 터치 환경: 목록에서 선택해 둔 팀
};

// 해당 부문 팀을 합산 점수(1·2차 합) 순으로. 점수가 없는 팀은 개발 중에만 명단 순서로 뒤에 붙인다.
export function useRanking(cat: Category) {
  const { standings } = useRealtime();
  const scored = standings.filter((s) => TEAMS.find((t) => t.id === s.teamId)?.cat === cat);
  const mock = useMock ? TEAMS.filter((t) => t.cat === cat && !scored.some((s) => s.teamId === t.id)).map((t) => ({ teamId: t.id, total: 0 })) : [];
  return [...scored, ...mock];
}

function Slot({ box, strong, g }: { box: Box; strong?: boolean; g: ReturnType<typeof geometry> }) {
  return <div style={pos(box, g)} className={`absolute rounded border bg-white ${strong ? 'border-accent' : 'border-line'}`} />;
}

const pos = (b: Box, g: { W: number; H: number }, w = BW) => ({
  left: `${(b.x / g.W) * 100}%`,
  top: `${(b.y / g.H) * 100}%`,
  width: `${(w / g.W) * 100}%`,
  height: `${(BH / g.H) * 100}%`,
});

// 점선 슬롯 한 칸: 팀을 놓는 곳. 놓인 팀은 다시 끌어 옮기거나 누르면 비워진다.
function DropSlot({ i, team, seeding }: { i: number; team?: string; seeding: Seeding }) {
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
      <span className="line-clamp-2 [word-break:keep-all]">{team ? teamName(team) : '팀'}</span>
    </div>
  );
}

export function BracketCanvas({ slots, seeding }: { slots: (string | undefined)[]; seeding?: Seeding }) {
  const g = seeding ? GEO.edit : GEO.view;
  const { W, H, R1, R2, R3, FINAL, THIRD, SOLID, DASHED } = g;
  const pct = (b: Box, dy = 0) => ({ left: `${(b.x / W) * 100}%`, top: `${((b.y + dy) / H) * 100}%` });
  return (
    <div className={`relative [container-type:inline-size] ${seeding ? 'min-w-[1100px]' : 'min-w-[760px]'}`} style={{ aspectRatio: `${W} / ${H}` }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" fill="none" aria-hidden>
        <path d={SOLID} stroke="#6B7280" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        <path d={DASHED} stroke="#258EED" strokeWidth={3} strokeDasharray="10 8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      {seeding &&
        R1.map((b, i) => (
          <div
            key={i}
            style={{ left: 0, top: `${(b.y / H) * 100}%`, width: `${(PW / W) * 100}%`, height: `${(BH / H) * 100}%` }}
            className="absolute flex gap-[2%] rounded bg-[#e5f3ff] p-[1.3%]"
          >
            <DropSlot i={2 * i} team={slots[2 * i]} seeding={seeding} />
            <DropSlot i={2 * i + 1} team={slots[2 * i + 1]} seeding={seeding} />
          </div>
        ))}

      {R1.map((b, i) => (
        <p key={i} style={pct(b, -30)} className="absolute whitespace-nowrap text-[1.1cqw] font-medium leading-none text-gray-500">
          {slots[2 * i] ? teamName(slots[2 * i]!) : '-'} vs {slots[2 * i + 1] ? teamName(slots[2 * i + 1]!) : '-'}
        </p>
      ))}

      {[...R1, ...R2, ...R3].map((b, i) => (
        <Slot key={i} box={b} g={g} />
      ))}
      <Slot box={FINAL} strong g={g} />
      <Slot box={THIRD} g={g} />
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
  const [cat, setCat] = useState<Category>('S');
  const seeds = useRanking(cat).slice(0, 16).map((s) => s.teamId);
  const slots = SEED_ORDER.map((seed) => seeds[seed - 1]);

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
