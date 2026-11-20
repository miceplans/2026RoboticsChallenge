import assert from 'node:assert/strict';
import test from 'node:test';
import { assignRanks, type Standing } from './contest.ts';

const row = (teamId: string, total: number) => ({ teamId, total }) as Standing;

test('동점이면 같은 순위를 주고 다음 순위는 동점 팀 수만큼 건너뛴다 (1,2,2,4,5,5,5,8)', () => {
  const totals = [100, 90, 90, 80, 70, 70, 70, 60];
  const ranked = assignRanks(totals.map((t, i) => row(`T${i}`, t)));
  assert.deepEqual(ranked.map((r) => r.rank), [1, 2, 2, 4, 5, 5, 5, 8]);
  assert.deepEqual(ranked.map((r) => r.tied), [false, true, true, false, true, true, true, false]);
});
