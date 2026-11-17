'use client';

import { useRealtime } from '@/lib/realtime/useRealtime';
import { withRanks, type RankedStanding, type Standing } from '@/lib/contest';
import type { Category } from '@/lib/judge/rules';

// 팀 점수의 단일 출처: 서버가 심판 확정 점수(confirmed/modified)로 집계한 순위표(standings).
// total 은 1·2라운드 중 높은 점수(합산 아님), r1/r2 는 각 라운드 확정 최고점이다. 화면은 이 훅만 통해 점수를 읽는다.
export type TeamScore = Standing & {
  // 1·2라운드 점수가 모두 나왔는지 (대진표는 이때만 점수를 보여준다)
  complete: boolean;
};

export function useTeamScores() {
  const { standings, standingsAt, status } = useRealtime();
  const byId = new Map(standings.map((s) => [s.teamId, s]));
  const scoreOf = (teamId?: string): TeamScore | undefined => {
    const s = teamId ? byId.get(teamId) : undefined;
    return s ? { ...s, complete: s.r1 !== null && s.r2 !== null } : undefined;
  };
  // 부문 순위(경쟁 순위·동점 표기 포함)
  const ranked = (cat: Category): RankedStanding[] => withRanks(standings, cat);
  return { standings, standingsAt, status, scoreOf, ranked };
}
