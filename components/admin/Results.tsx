'use client';

import { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/Toast';
import { useContest, type Team, type TournamentGame, type TournamentRound, type TournamentSideScore } from '@/lib/contest';
import { CATEGORY_NAMES, type Category } from '@/lib/judge/rules';
import { adminFetch, btn, card, downloadCsv, Icon } from './shared';

type ScoreRow = {
  matchId: string;
  teamId: string;
  points: number;
  status: string;
};

type ResultRow = {
  team: Team;
  round1?: number;
  round2?: number;
  tournament: Partial<Record<TournamentRound, number>>;
};

const FINAL_COLUMNS: { round: TournamentRound; label: string }[] = [
  { round: 'QF', label: '8강' },
  { round: 'SF', label: '4강' },
  { round: '3P', label: '3·4위' },
  { round: 'F', label: '결승' },
];

function tournamentScore(game: TournamentGame, teamId: string, sides: TournamentSideScore[]) {
  if (game.status !== 'done') {
    // 확정 전이라도 그 팀 채점이 제출됐으면 보여 준다
    const side = game.teamA === teamId ? 'A' : game.teamB === teamId ? 'B' : null;
    return side ? sides.find((x) => x.cat === game.cat && x.round === game.round && x.gameNo === game.gameNo && x.side === side)?.points : undefined;
  }
  if (game.teamA === teamId) return game.scoreA ?? undefined;
  if (game.teamB === teamId) return game.scoreB ?? undefined;
  return undefined;
}

const scoreText = (score?: number) => score === undefined ? '-' : score.toLocaleString('ko-KR');

export default function Results() {
  const toast = useToast();
  const { config } = useContest();
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [category, setCategory] = useState<'' | Category>('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminFetch<{ scores: ScoreRow[] }>('/admin/scores');
      setScores(data.scores);
    } catch (error) {
      toast((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const rows = useMemo<ResultRow[]>(() => {
    const accepted = scores.filter((score) => score.status === 'confirmed' || score.status === 'modified');
    const best = (teamId: string, round: 1 | 2) => {
      const values = accepted
        .filter((score) => score.teamId === teamId && score.matchId.startsWith(`R${round}-`))
        .map((score) => score.points);
      return values.length ? Math.max(...values) : undefined;
    };
    const games = config?.tournament.games ?? [];
    const sides = config?.tournament.sideScores ?? [];

    return (config?.teams ?? [])
      .filter((team) => !category || team.cat === category)
      .sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name, 'ko'))
      .map((team) => {
        const tournament: ResultRow['tournament'] = {};
        for (const { round } of FINAL_COLUMNS) {
          const game = games.find((candidate) => candidate.cat === team.cat && candidate.round === round && (candidate.teamA === team.id || candidate.teamB === team.id));
          if (game) tournament[round] = tournamentScore(game, team.id, sides);
        }
        return { team, round1: best(team.id, 1), round2: best(team.id, 2), tournament };
      });
  }, [category, config?.teams, config?.tournament.games, config?.tournament.sideScores, scores]);

  const exportCsv = () => {
    const header = ['부문', '팀 ID', '팀명', '1차', '2차', ...FINAL_COLUMNS.map((column) => column.label)];
    const body = rows.map((row) => [
      CATEGORY_NAMES[row.team.cat],
      row.team.id,
      row.team.name,
      row.round1 ?? '',
      row.round2 ?? '',
      ...FINAL_COLUMNS.map(({ round }) => row.tournament[round] ?? ''),
    ]);
    downloadCsv(`game-results-${category || 'all'}-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
  };

  return (
    <section className={`${card} p-6`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold text-heading">경기 결과</h1>
          <p className="mt-2 text-sm text-gray-500">팀별 확정 점수를 예선부터 결승까지 한눈에 보여줍니다.</p>
        </div>
        <div className="flex gap-2">
          <button className={btn} onClick={() => void load()} disabled={loading}><span className="inline-flex items-center gap-1"><Icon name="refresh" />새로고침</span></button>
          <button className={btn} onClick={exportCsv}><span className="inline-flex items-center gap-1"><Icon name="download" />CSV 내보내기</span></button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="부문 선택">
        {([{ id: '', label: '전체' }, { id: 'J', label: '주니어' }, { id: 'S', label: '시니어' }] as { id: '' | Category; label: string }[]).map((item) => (
          <button key={item.id} role="tab" aria-selected={category === item.id} onClick={() => setCategory(item.id)} className={`rounded-2xl border px-4 py-2 text-sm font-semibold ${category === item.id ? 'border-accent bg-accent text-white' : 'border-line text-gray-600 hover:border-line-hover'}`}>
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-accent text-white">
            <tr>
              <th className="px-4 py-3 font-semibold">부문</th>
              <th className="px-4 py-3 font-semibold">팀명</th>
              <th className="px-4 py-3 text-center font-semibold">1차</th>
              <th className="px-4 py-3 text-center font-semibold">2차</th>
              {FINAL_COLUMNS.map((column) => <th key={column.round} className="px-4 py-3 text-center font-semibold">{column.label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr key={row.team.id} className="hover:bg-surface">
                <td className="px-4 py-3 text-gray-500">{CATEGORY_NAMES[row.team.cat]}</td>
                <td className="px-4 py-3"><span className="font-semibold">{row.team.name}</span><span className="ml-2 text-xs text-gray-400">{row.team.id}</span></td>
                <td className="px-4 py-3 text-center font-semibold tabular-nums">{scoreText(row.round1)}</td>
                <td className="px-4 py-3 text-center font-semibold tabular-nums">{scoreText(row.round2)}</td>
                {FINAL_COLUMNS.map(({ round }) => <td key={round} className="px-4 py-3 text-center font-semibold tabular-nums">{scoreText(row.tournament[round])}</td>)}
              </tr>
            ))}
            {!loading && rows.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">표시할 팀이 없습니다.</td></tr>}
            {loading && <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">결과를 불러오는 중…</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-gray-500">예선은 확정·수정된 점수만, 본선은 승자가 확정된 경기 점수만 표시합니다. 경기하지 않은 라운드는 -로 표시됩니다.</p>
    </section>
  );
}
