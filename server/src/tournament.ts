// 토너먼트 대진·결과 (8강 QF → 준결승 SF → 결승 F · 3·4위전 3P).
// rebuildTournament 가 슬롯 배정 + 입력된 결과로 경기 테이블 전체를 일관되게 다시 계산한다.
import { db } from './db/connection.ts';

// 토너먼트는 예선(1·2차) 순위 상위 8팀으로 8강(QF)부터 시작한다 — 16강은 없다.
export type TournamentRound = 'QF' | 'SF' | 'F' | '3P';
export type Tournament = {
  slots: { cat: 'J' | 'S'; slotNo: number; teamId: string | null }[];
  games: {
    cat: 'J' | 'S';
    round: TournamentRound;
    gameNo: number;
    teamA: string | null;
    teamB: string | null;
    scoreA: number | null;
    scoreB: number | null;
    winner: string | null;
    status: 'scheduled' | 'done';
  }[];
  // 심판이 입력해 제출한 경기 점수. 관리자가 칸별로 '확정' 해야 결과로 저장된다.
  submissions: { cat: 'J' | 'S'; round: TournamentRound; gameNo: number; scoreA: number; scoreB: number; judgeId: string; ts: number }[];
};

// --- 토너먼트 ---

export function getTournament(): Tournament {
  const slots = db.prepare('SELECT cat, slot_no AS slotNo, team_id AS teamId FROM tournament_slots ORDER BY cat, slot_no').all() as Tournament['slots'];
  const games = db.prepare(`SELECT cat, round, game_no AS gameNo, team_a AS teamA, team_b AS teamB, score_a AS scoreA, score_b AS scoreB,
    winner, status, updated_at AS updatedAt FROM tournament_games ORDER BY cat, round, game_no`).all() as unknown as Tournament['games'];
  const submissions = db.prepare('SELECT cat, round, game_no AS gameNo, score_a AS scoreA, score_b AS scoreB, judge_id AS judgeId, ts FROM tournament_submissions ORDER BY cat, round, game_no').all() as unknown as Tournament['submissions'];
  return { slots, games, submissions };
}

// 토너먼트 8슬롯 배정 저장 (전체 교체). 빈 칸은 null 로 저장한다.
// 배정이 바뀌면 기존 경기 결과는 무효 — 다시 입력해야 한다.
export function saveTournamentSlots(cat: 'J' | 'S', teamIds: (string | null)[]): void {
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM tournament_slots WHERE cat = ?').run(cat);
    db.prepare('DELETE FROM tournament_submissions WHERE cat = ?').run(cat);
    const ins = db.prepare('INSERT INTO tournament_slots (cat, slot_no, team_id) VALUES (?, ?, ?)');
    teamIds.forEach((teamId, i) => ins.run(cat, i + 1, teamId));
    rebuildTournament(cat, new Map());
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

const ROUND_ORDER: TournamentRound[] = ['QF', 'SF', 'F', '3P'];

// 저장된 경기 결과. 동점은 관리자가 고른 승자(tb: A/B)가 있어야 승부가 갈린다 — 저장된 winner 와 team_a 로 되살린다.
type GameResult = { scoreA: number; scoreB: number; tb?: 'A' | 'B' };
function savedResults(cat: 'J' | 'S'): Map<string, GameResult> {
  const rows = db.prepare('SELECT round, game_no, score_a, score_b, team_a, winner FROM tournament_games WHERE cat = ? AND score_a IS NOT NULL AND score_b IS NOT NULL').all(cat) as { round: string; game_no: number; score_a: number; score_b: number; team_a: string | null; winner: string | null }[];
  return new Map(rows.map((r) => [`${r.round}-${r.game_no}`, { scoreA: r.score_a, scoreB: r.score_b, tb: r.score_a === r.score_b && r.winner ? (r.winner === r.team_a ? 'A' : 'B') : undefined } as GameResult]));
}

// 결과 하나를 저장하고 해당 부문 전체를 일관되게 다시 계산한다 (승자 진출·3·4위전 패자 배정).
// 더 아래 라운드에 이미 입력된 결과는 무효가 된다 — 바뀐 대진으로 다시 치러야 하므로.
export function saveTournamentResult(cat: 'J' | 'S', round: TournamentRound, gameNo: number, scoreA: number, scoreB: number, tb?: 'A' | 'B'): void {
  db.exec('BEGIN');
  try {
    const keepIdx = ROUND_ORDER.indexOf(round);
    const results = new Map<string, GameResult>();
    for (const [key, r] of savedResults(cat)) {
      if (ROUND_ORDER.indexOf(key.split('-')[0] as TournamentRound) <= keepIdx) results.set(key, r);
    }
    results.set(`${round}-${gameNo}`, { scoreA, scoreB, tb: scoreA === scoreB ? tb : undefined });
    rebuildTournament(cat, results);
    // 바뀐 대진으로 다시 치러야 하는 하위 라운드의 심판 제출은 무효
    for (const r of ROUND_ORDER.slice(keepIdx + 1)) db.prepare('DELETE FROM tournament_submissions WHERE cat = ? AND round = ?').run(cat, r);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// 심판이 경기 점수를 제출한다 (두 팀이 정해졌고 아직 확정되지 않은 경기만). 같은 경기를 다시 제출하면 덮어쓴다.
export function submitTournamentScore(cat: 'J' | 'S', round: TournamentRound, gameNo: number, scoreA: number, scoreB: number, judgeId: string): void {
  const g = db.prepare('SELECT team_a, team_b, status FROM tournament_games WHERE cat = ? AND round = ? AND game_no = ?').get(cat, round, gameNo) as { team_a: string | null; team_b: string | null; status: string } | undefined;
  if (!g) throw new Error('경기를 찾을 수 없습니다.');
  if (!g.team_a || !g.team_b) throw new Error('아직 두 팀이 정해지지 않은 경기입니다.');
  if (g.status === 'done') throw new Error('이미 확정된 경기입니다. 운영본부에 변경을 요청하세요.');
  db.prepare(`INSERT INTO tournament_submissions (cat, round, game_no, score_a, score_b, judge_id, ts) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (cat, round, game_no) DO UPDATE SET score_a = excluded.score_a, score_b = excluded.score_b, judge_id = excluded.judge_id, ts = excluded.ts`).run(cat, round, gameNo, scoreA, scoreB, judgeId, Date.now());
}

// 확정된 경기를 다시 열어 심판이 점수를 다시 입력하게 한다. 이 경기와 하위 라운드의 결과·제출은 지워진다.
export function reopenTournamentGame(cat: 'J' | 'S', round: TournamentRound, gameNo: number): void {
  db.exec('BEGIN');
  try {
    const keepIdx = ROUND_ORDER.indexOf(round);
    const results = new Map<string, GameResult>();
    for (const [key, r] of savedResults(cat)) {
      const [rd, no] = key.split('-');
      if (ROUND_ORDER.indexOf(rd as TournamentRound) > keepIdx || (rd === round && Number(no) === gameNo)) continue;
      results.set(key, r);
    }
    rebuildTournament(cat, results);
    db.prepare('DELETE FROM tournament_submissions WHERE cat = ? AND round = ? AND game_no = ?').run(cat, round, gameNo);
    for (const r of ROUND_ORDER.slice(keepIdx + 1)) db.prepare('DELETE FROM tournament_submissions WHERE cat = ? AND round = ?').run(cat, r);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// 슬롯 배정 + 입력된 결과들로 경기 테이블 전체를 재구축한다.
// 8강(QF 4경기) → 준결승(2) → 결승, 준결승 패자는 3·4위전. 팀이 채워지지 않거나 결과가 없는 경기는 예정 상태로 둔다.
// 슬롯 2j-1 vs 2j 가 j번째 8강 경기 (홀수 승자는 A, 짝수 승자는 B).
function rebuildTournament(cat: 'J' | 'S', results?: Map<string, GameResult>): void {
  const resultsMap: Map<string, GameResult> = results ?? savedResults(cat);
  const slots = (db.prepare('SELECT slot_no, team_id FROM tournament_slots WHERE cat = ? ORDER BY slot_no').all(cat) as { slot_no: number; team_id: string | null }[]).map((s) => s.team_id);

  db.prepare('DELETE FROM tournament_games WHERE cat = ?').run(cat);
  const ins = db.prepare(`INSERT INTO tournament_games (cat, round, game_no, team_a, team_b, score_a, score_b, winner, status, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const now = Date.now();
  const games = new Map<string, { teamA: string | null; teamB: string | null; scoreA: number | null; scoreB: number | null; winner: string | null; status: 'scheduled' | 'done' }>();
  // 배정을 저장한 부문은 8강~결승·3·4위전 행을 모두 갖는다 (빈 경기는 예정 상태)
  for (let j = 1; j <= 4; j++) games.set(`QF-${j}`, { teamA: null, teamB: null, scoreA: null, scoreB: null, winner: null, status: 'scheduled' });
  for (let k = 1; k <= 2; k++) games.set(`SF-${k}`, { teamA: null, teamB: null, scoreA: null, scoreB: null, winner: null, status: 'scheduled' });
  games.set('F-1', { teamA: null, teamB: null, scoreA: null, scoreB: null, winner: null, status: 'scheduled' });
  games.set('3P-1', { teamA: null, teamB: null, scoreA: null, scoreB: null, winner: null, status: 'scheduled' });

  const setTeam = (key: string, which: 'A' | 'B', teamId: string) => {
    const g = games.get(key) ?? { teamA: null, teamB: null, scoreA: null, scoreB: null, winner: null, status: 'scheduled' as const };
    if (which === 'A') g.teamA = teamId;
    else g.teamB = teamId;
    games.set(key, g);
  };
  const applyResult = (key: string) => {
    const res = resultsMap.get(key);
    const g = games.get(key);
    if (!res || !g?.teamA || !g.teamB) return null;
    g.scoreA = res.scoreA;
    g.scoreB = res.scoreB;
    // 동점이면 관리자가 정한 승자(tb)가 있을 때만 승부가 갈린다. 없으면 예정 상태로 둔다 (룰북 i.4.3)
    const aWins = res.scoreA === res.scoreB ? res.tb === 'A' : res.scoreA > res.scoreB;
    const bWins = res.scoreA === res.scoreB ? res.tb === 'B' : res.scoreB > res.scoreA;
    if (!aWins && !bWins) return null;
    g.status = 'done';
    g.winner = aWins ? g.teamA : g.teamB;
    return { winner: g.winner, loser: aWins ? g.teamB : g.teamA };
  };

  // 8강: 슬롯 2j-1 vs 2j → 준결승 (홀수 승자는 A, 짝수 승자는 B)
  for (let j = 1; j <= 4; j++) {
    const key = `QF-${j}`;
    const a = slots[2 * j - 2] ?? null;
    const b = slots[2 * j - 1] ?? null;
    if (a) setTeam(key, 'A', a);
    if (b) setTeam(key, 'B', b);
    const out = applyResult(key);
    if (out) setTeam(`SF-${Math.ceil(j / 2)}`, j % 2 ? 'A' : 'B', out.winner);
  }
  // 준결승 → 결승(승자) · 3·4위전(패자)
  for (let k = 1; k <= 2; k++) {
    const out = applyResult(`SF-${k}`);
    if (out) {
      setTeam(`F-${1}`, k === 1 ? 'A' : 'B', out.winner);
      setTeam(`3P-${1}`, k === 1 ? 'A' : 'B', out.loser);
    }
  }
  applyResult('F-1');
  applyResult('3P-1');

  for (const [key, g] of games) {
    const [round, no] = key.split('-') as [TournamentRound, string];
    ins.run(cat, round, Number(no), g.teamA, g.teamB, g.scoreA, g.scoreB, g.winner, g.status, now);
  }
}

// 4강 이후 슬롯에 팀을 직접 지정한다 (기권·부전승 등 점수 입력으로 반영하기 어려운 경우).
// 해당 경기의 결과가 이미 있으면 무효가 되도록 승자를 지우고 예정 상태로 돌린다.
// 주의: 상위 라운드 결과를 다시 저장해 rebuildTournament 가 돌면 수동 지정은 결과 기반 배정으로 덮인다.
export function setTournamentTeam(cat: 'J' | 'S', round: TournamentRound, gameNo: number, side: 'A' | 'B', teamId: string | null): boolean {
  if (round === 'QF') return false; // 8강은 슬롯 배정으로만 정한다
  if (teamId) {
    const exists = db.prepare('SELECT COUNT(*) AS c FROM teams WHERE id = ?').get(teamId) as { c: number };
    if (exists.c === 0) throw new Error(`unknown_team:${teamId}`);
  }
  const col = side === 'A' ? 'team_a' : 'team_b';
  const res = db.prepare(`UPDATE tournament_games SET ${col} = ?, winner = NULL, status = 'scheduled', score_a = NULL, score_b = NULL, updated_at = ?
    WHERE cat = ? AND round = ? AND game_no = ?`).run(teamId, Date.now(), cat, round, gameNo);
  return res.changes > 0;
}
