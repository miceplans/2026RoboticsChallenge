// 동점이면 같은 순위를 준다 (예: 1, 2, 2, 4, 5, 5, 5, 8). standings 는 점수 내림차순이어야 한다.
export function ranksOf(standings: { total: number }[]): number[] {
  return standings.map((s, i) => {
    let first = i;
    while (first > 0 && standings[first - 1].total === s.total) first--;
    return first + 1;
  });
}
