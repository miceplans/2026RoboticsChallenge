import { useTeamScores } from '@/lib/scores';
import { compareStandings, SEED_ORDER, useContest, type TournamentGame, type TournamentRound } from '@/lib/contest';
import type { Category } from '@/lib/judge/rules';

// 8팀 시드 배치는 lib/contest.ts 의 표준 시드를 그대로 쓴다 (1v8, 4v5 / 2v7, 3v6)
export { SEED_ORDER };

export type Seeding = {
  slots: (string | undefined)[]; // 8칸: 2*i, 2*i+1 이 i번째 8강 경기
  onDrop: (slot: number, payload: string) => void; // payload: 'team:ID' | 'slot:N'
  onClear: (slot: number) => void;
  picked?: string; // 터치 환경: 목록에서 선택해 둔 팀
};

// 해당 부문 팀을 점수(1·2차 중 높은 점수) 순으로. 점수가 없는 팀도 0점으로 함께 집계된다.
// 관리자가 순위 조정(rankOrder)을 저장했으면 그 순서를 우선하고, 명단에 빠진 팀은 계산 순위대로 뒤에 붙인다.
export function useRanking(cat: Category) {
  const { standings } = useTeamScores();
  const { config } = useContest();
  const teams = config?.teams ?? [];
  const scored = standings.filter((s) => teams.find((t) => t.id === s.teamId)?.cat === cat);
  const merged = [...scored].sort(compareStandings);
  const order = config?.settings.rankOrder[cat];
  if (!order?.length) return merged;
  const byId = new Map(merged.map((m) => [m.teamId, m]));
  const picked = order.map((id) => byId.get(id)).filter((m) => m !== undefined);
  const rest = merged.filter((m) => !order.includes(m.teamId));
  return [...picked, ...rest];
}

// 8강 경기 점수를 입력하는 중(저장 전)에 4강 자리에 미리 보여주는 승자
// winnerScore / loserScore: 승자·패자 각자의 경기 점수 (칸에는 '승자 : 패자' 순서로 보인다)
export type QfPreview = { winner: string; loser: string; winnerScore: number; loserScore: number };

// BracketCanvas 박스 순서(8강 4칸 → 준결승 2칸 → 결승 → 3·4위전)와 같은 경기 키. 관리자 화면과 공개 대진표가 함께 쓴다.
export const GAME_KEYS: { round: TournamentRound; no: number }[] = [
  { round: 'QF', no: 1 }, { round: 'QF', no: 2 }, { round: 'QF', no: 3 }, { round: 'QF', no: 4 },
  { round: 'SF', no: 1 }, { round: 'SF', no: 2 }, { round: 'F', no: 1 }, { round: '3P', no: 1 },
];

// 확정된(done) 경기 결과만으로 만든 승자 표시. 공개 대진표와 관리자 화면이 같은 서버 경기 데이터를 쓰도록 한 곳에서 계산한다.
export function confirmedPreview(games: TournamentGame[], cat: Category): (QfPreview | undefined)[] {
  return GAME_KEYS.map(({ round, no }) => {
    const g = games.find((x) => x.cat === cat && x.round === round && x.gameNo === no);
    if (!g || g.status !== 'done' || !g.teamA || !g.teamB || g.scoreA == null || g.scoreB == null || !g.winner) return undefined;
    const aWon = g.winner === g.teamA;
    return { winner: g.winner, loser: aWon ? g.teamB : g.teamA, winnerScore: aWon ? g.scoreA : g.scoreB, loserScore: aWon ? g.scoreB : g.scoreA };
  });
}
