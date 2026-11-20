import type { Match, Team } from '@/lib/judge/data';
import { calc, validate } from '@/lib/judge/rules';
import type { Sheet } from '@/lib/judge/sheets';
import ScoreTable from './ScoreTable';
import { btnGhost, btnPrimary } from './ui';

export default function ReviewView({ match, team, sheet, onEdit, onSign }: { match: Match; team: Team; sheet: Sheet; onEdit: () => void; onSign: () => void }) {
  const c = calc(sheet.values, match.cat);
  const problems = validate(sheet.values);

  return (
    <main className="mx-auto max-w-3xl rounded-2xl border border-line bg-white p-6">
      <p className="font-bold text-accent">심판과 참가팀 대표가 함께 확인해 주십시오</p>
      <h1 className="mt-2 text-2xl font-extrabold">{team.id} {team.name} · {match.round}차 조별 라운드</h1>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <ScoreTable values={sheet.values} cat={match.cat} />

        <div>
          <div className="rounded-2xl bg-accent/10 p-6 text-center">
            <small className="text-gray-600">총점</small>
            <p className="mt-2 text-6xl font-extrabold text-accent">{c.total}</p>
            <p className="mt-3 text-xs text-gray-600">미션1 {c.sum.M1} · 미션2 {c.sum.M2} · 일반 벌점 {c.sum.PEN}</p>
          </div>
          {problems.length > 0 && <p className="mt-3 text-sm font-bold text-error">{problems[0].msg}</p>}
          <div className="mt-4 flex flex-col gap-2">
            <button type="button" className={btnGhost} onClick={onEdit}>← 수정하기</button>
            <button type="button" className={`${btnPrimary} py-4 text-lg`} onClick={onSign} disabled={problems.length > 0}>서명하기</button>
          </div>
        </div>
      </div>
    </main>
  );
}
