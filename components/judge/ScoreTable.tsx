import { autoLabel, calc, MISSION_NAMES, validate, type Category, type Mission, type Values } from '@/lib/judge/rules';

// 채점표 양식과 같은 순서·항목으로 보여주는 읽기 전용 표. 사유는 채점표에 넣지 않는다.
export default function ScoreTable({ values, cat }: { values: Values; cat: Category }) {
  const c = calc(values, cat);
  const bad = new Set(validate(values).flatMap((p) => p.ids));

  return (
    <div className="self-start overflow-hidden rounded-xl border border-line">
      <table className="w-full text-sm">
        <thead className="bg-accent text-white">
          <tr>
            <th className="px-4 py-3 text-left font-bold">채점 항목</th>
            <th className="whitespace-nowrap px-4 py-3 text-right font-bold">표시</th>
            <th className="px-4 py-3 text-right font-bold">점수</th>
          </tr>
        </thead>
        {(['M1', 'M2', 'PEN'] as Mission[]).map((g) => (
          <tbody key={g} className="divide-y divide-line border-t border-line">
            <tr className="bg-surface-secondary">
              <th colSpan={3} className="px-4 py-2 text-left font-bold">{MISSION_NAMES[g]}</th>
            </tr>
            {c.lines.filter((l) => l.it.m === g).map((l) => {
              const auto = l.it.type === 'auto';
              const problem = bad.has(l.it.id);
              const mark =
                l.it.type === 'bool' || l.it.type === 'dq' ? (l.q ? '예' : '아니오')
                : g === 'PEN' ? `${l.q}회`
                : l.q;
              return (
                <tr key={l.it.id} className={problem ? 'bg-error/10 text-error' : auto ? 'text-gray-400' : ''}>
                  <td className="px-4 py-3">{auto ? autoLabel(l.it.label) : l.it.label}</td>
                  <td className={`px-4 py-3 text-right ${l.it.type === 'dq' && l.q ? 'font-bold text-error' : ''}`}>{mark}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${auto ? '' : 'font-bold'} ${l.sub < 0 ? 'text-error' : ''}`}>
                    {l.it.type === 'dq' ? '' : `${l.sub > 0 ? '+' : ''}${l.sub}`}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-surface">
              <td colSpan={2} className="px-4 py-3 font-bold">{g === 'PEN' ? <>일반 벌점 소계<span className="print:hidden"> · 패널티 {c.penCnt}회</span></> : `${g === 'M1' ? '미션 1' : '미션 2'} 소계`}</td>
              <td className="px-4 py-3 text-right font-bold tabular-nums">{c.sum[g]}</td>
            </tr>
          </tbody>
        ))}
        {c.dq && (
          <tbody>
            <tr>
              <td colSpan={3} className="px-4 py-3 font-bold text-error">실격 — 경기 0점</td>
            </tr>
          </tbody>
        )}
      </table>
    </div>
  );
}
