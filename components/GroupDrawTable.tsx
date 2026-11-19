'use client';

import { GROUPS, SIDES, type Match, type Side } from '@/lib/contest';
import { CATEGORY_NAMES, type Category } from '@/lib/judge/rules';

// 조 추첨표 (공개 중계 화면·관리자 입력 공용). 부문마다 1~8조 × A/B 테이블 16칸.
// 주니어는 주황, 시니어는 남색으로 구분한다.
export const DRAW_THEME: Record<Category, { head: string; soft: string; text: string }> = {
  J: { head: '#ec7434', soft: '#fde4d6', text: '#e0661f' },
  S: { head: '#0d3b9f', soft: '#d8e2fa', text: '#0d3b9f' },
};

export type Round = 1 | 2;
export type Board = Record<string, string | undefined>; // 칸('조-A|B') → 팀 ID
export const slotKey = (g: number, side: Side) => `${g}-${side}`;
export const SLOT_KEYS = GROUPS.flatMap((g) => SIDES.map((s) => slotKey(g, s)));

export function boardOf(matches: Match[], cat: Category, round: Round): Board {
  const b: Board = {};
  for (const m of matches) if (m.cat === cat && m.round === round) b[slotKey(m.table, m.wave)] = m.team;
  return b;
}

export default function GroupDrawTable({
  cat,
  teamCount,
  renderTeam,
}: {
  cat: Category;
  teamCount: number;
  renderTeam: (g: number, side: Side) => React.ReactNode;
}) {
  const t = DRAW_THEME[cat];
  const border = 'border border-[#c9d6ee]';
  return (
    <div className="min-w-0">
      <div className="mb-3 inline-flex h-9 items-center rounded-lg px-5 text-[15px] font-bold text-white" style={{ background: t.head }}>
        {CATEGORY_NAMES[cat]} · {teamCount}팀
      </div>
      <table className="w-full table-fixed border-collapse bg-white text-sm">
        <colgroup><col className="w-[17%]" /><col className="w-[17%]" /><col /></colgroup>
        <thead className="text-white" style={{ background: t.head }}>
          <tr>
            <th className={`${border} py-2 font-semibold`}>조</th>
            <th className={`${border} py-2 font-semibold`}>테이블</th>
            <th className={`${border} py-2 font-semibold`}>팀명</th>
          </tr>
        </thead>
        <tbody>
          {GROUPS.flatMap((g) =>
            SIDES.map((side, i) => (
              <tr key={`${g}-${side}`} className="h-[30px]">
                {i === 0 && (
                  <th rowSpan={SIDES.length} className={`${border} font-bold`} style={{ background: t.soft, color: t.text }}>
                    {g}조
                  </th>
                )}
                <td className={`${border} text-center font-semibold text-gray-800`}>{side}</td>
                <td className={`${border} px-3 py-0.5`}>{renderTeam(g, side)}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}
