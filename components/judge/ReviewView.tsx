import type { Match, Team } from '@/lib/contest';
import { calc, ITEMS, type Item } from '@/lib/judge/rules';
import type { Sheet } from '@/lib/judge/sheets';
import { btnGhost, btnPrimary } from './ui';

export default function ReviewView({ match, team, sheet, onEdit, onSign, ruleItems = ITEMS }: { match: Match; team: Team; sheet: Sheet; onEdit: () => void; onSign: () => void; ruleItems?: Item[] }) {
  const c = calc(sheet.values, match.cat, ruleItems);
  // 점수가 있거나 개수형(감점 제외)인 항목만 보여준다
  const rows = c.lines.filter((l) => l.sub !== 0 || (l.it.type === 'count' && l.it.m !== 'PEN'));

  return (
    <main className="mx-auto max-w-3xl rounded-2xl border border-line bg-white p-6">
      <p className="font-bold text-accent">심판과 참가팀 대표가 함께 확인해 주세요</p>
      <h1 className="mt-2 text-2xl font-extrabold">{team.id} {team.name} · {match.round}차 조별 라운드</h1>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <div className="self-start overflow-hidden rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-accent text-white">
            <tr>
              <th className="px-4 py-3 text-left font-bold">채점 항목</th>
              <th className="whitespace-nowrap px-4 py-3 text-right font-bold">개수</th>
              <th className="px-4 py-3 text-right font-bold">점수</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((l) => (
              <tr key={l.it.id}>
                <td className="px-4 py-3">{l.it.label}</td>
                <td className="px-4 py-3 text-right">{l.it.type === 'manual' ? '-' : l.it.type === 'bool' ? (l.q ? '예' : '아니오') : l.q}</td>
                <td className={`px-4 py-3 text-right font-bold tabular-nums ${l.sub < 0 ? 'text-error' : ''}`}>
                  {l.sub > 0 ? '+' : ''}{l.sub}
                </td>
              </tr>
            ))}
            {c.dq && (
              <tr>
                <td colSpan={3} className="px-4 py-3 font-bold text-error">실격 — 경기 0점</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>

        <div>
          <div className="rounded-2xl bg-accent/10 p-6 text-center">
            <small className="text-gray-600">총점</small>
            <p className="mt-2 text-6xl font-extrabold text-accent">{c.total}</p>
            <p className="mt-3 text-xs text-gray-600">
              미션1 {c.sum.M1} · 미션2 {c.sum.M2} · 감점 {c.sum.PEN}
              <br />
              리셋 {Number(sheet.values.resets) || 0}회 · 종료 {sheet.values.endTime || 120}초
            </p>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <button type="button" className={btnGhost} onClick={onEdit}>← 수정하기</button>
            <button type="button" className={`${btnPrimary} py-4 text-lg`} onClick={onSign}>서명하기</button>
          </div>
        </div>
      </div>
    </main>
  );
}
