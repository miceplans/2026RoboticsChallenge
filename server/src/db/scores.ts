import { db } from './connection.ts';
import { autoConfirm } from './settings.ts';
import { logAudit, type AuditAction } from './audit.ts';

// --- 점수 ---

export type ScoreStatus = 'pending' | 'confirmed' | 'modified' | 'rejected';
export type ScoreInput = {
  matchId: string;
  teamId: string;
  judgeId: string;
  points: number;
  ts: number;
  sheet: string | null; // 채점지 전체(JSON 문자열). 점수만 본내는 경우 null
  penCnt?: number; // 규정 순위 3순위(감점 적은 순) 집계용
};
export type Standing = { teamId: string; teamName: string; teamOrg: string | null; cat: 'J' | 'S'; total: number; sum: number; pen: number; r1: number | null; r2: number | null };
export type TeamScore = { matchId: string; judgeId: string; points: number; ts: number; status: ScoreStatus };
export type PendingScore = {
  matchId: string;
  teamId: string;
  teamName: string | null;
  judgeId: string;
  judgeName: string | null;
  points: number;
  ts: number;
  status: ScoreStatus;
};

const getScore = db.prepare('SELECT ts, status, points, sheet, pen_cnt FROM scores WHERE match_id = ? AND team_id = ? AND judge_id = ?');
const insertScore = db.prepare(`INSERT INTO scores (match_id, team_id, judge_id, points, ts, sheet, status, pen_cnt, confirmed_at, confirmed_by)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const updateScore = db.prepare(`UPDATE scores SET points = ?, ts = ?, sheet = ?, status = ?, pen_cnt = ?, confirmed_at = ?, confirmed_by = ?
  WHERE match_id = ? AND team_id = ? AND judge_id = ? AND ? > ts`);

// 심판 제출 upsert.
// - 더 오래된 ts 면 무시 (멱등).
// - 심판은 확정된 자기 채점을 다시 열어 고칠 수 있다(심판·팀 대표 재서명 후 더 새로운 ts 로 재제출). 이전 값은 감사 로그의 prevStatus 로 남는다.
// - 관리자 정정(modified) 행은 재전송이 덮지 못한다. 복구(resendAll) 재전송은 원래 ts 를 그대로 쓰므로 무시되지 않는다.
// - 반려(rejected) 상태면 더 새로운 ts 로 다시 제출해 확정 절차를 다시 거칠 수 있다.
export function saveScore(s: ScoreInput): { written: boolean; status: ScoreStatus } {
  const key = [s.matchId, s.teamId, s.judgeId] as const;
  db.exec('BEGIN');
  try {
    const row = getScore.get(...key) as { ts: number; status: ScoreStatus; points: number } | undefined;
    if (!row) {
      const status: ScoreStatus = autoConfirm() ? 'confirmed' : 'pending';
      insertScore.run(s.matchId, s.teamId, s.judgeId, s.points, s.ts, s.sheet, status, s.penCnt ?? 0, status === 'confirmed' ? Date.now() : null, status === 'confirmed' ? s.judgeId : null);
      logAudit(s.judgeId, 'submit', 'score', `${s.matchId}/${s.teamId}`, { points: s.points, status });
      db.exec('COMMIT');
      return { written: true, status };
    }
    if (s.ts <= row.ts || row.status === 'modified') {
      db.exec('COMMIT');
      return { written: false, status: row.status };
    }
    const status: ScoreStatus = autoConfirm() ? 'confirmed' : 'pending';
    updateScore.run(s.points, s.ts, s.sheet, status, s.penCnt ?? 0, status === 'confirmed' ? Date.now() : null, status === 'confirmed' ? s.judgeId : null, ...key, s.ts);
    logAudit(s.judgeId, 'submit', 'score', `${s.matchId}/${s.teamId}`, { points: s.points, prevPoints: row.points, prevStatus: row.status, status });
    db.exec('COMMIT');
    return { written: true, status };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function changeScoreStatus(key: readonly [string, string, string], status: ScoreStatus, actorId: string, action: AuditAction, detail: Record<string, unknown>, fromStatuses: ScoreStatus[]): boolean {
  const row = getScore.get(...key) as { ts: number; status: ScoreStatus; points: number; sheet: string | null; pen_cnt: number } | undefined;
  if (!row || !fromStatuses.includes(row.status)) return false;  db.prepare('UPDATE scores SET status = ?, confirmed_at = ?, confirmed_by = ? WHERE match_id = ? AND team_id = ? AND judge_id = ?')
    .run(status, Date.now(), actorId, ...key);
  logAudit(actorId, action, 'score', `${key[0]}/${key[1]}`, { judgeId: key[2], prev: row, ...detail });
  return true;
}

export const confirmScore = (matchId: string, teamId: string, judgeId: string, actorId: string) =>
  changeScoreStatus([matchId, teamId, judgeId], 'confirmed', actorId, 'confirm', {}, ['pending', 'rejected']);
export const rejectScore = (matchId: string, teamId: string, judgeId: string, actorId: string, reason: string) =>
  changeScoreStatus([matchId, teamId, judgeId], 'rejected', actorId, 'reject', { reason }, ['pending', 'confirmed', 'modified']);

// 관리자 정정: 어떤 상태에서든 가능. 이전 값 전체를 감사 로그에 남긴다.
export function modifyScore(matchId: string, teamId: string, judgeId: string, actorId: string, patch: { points?: number; sheet?: string | null; penCnt?: number; reason?: string }): boolean {
  const key = [matchId, teamId, judgeId] as const;
  const row = getScore.get(...key) as { ts: number; status: ScoreStatus; points: number; sheet: string | null; pen_cnt: number } | undefined;
  if (!row) return false;
  db.prepare('UPDATE scores SET points = ?, sheet = ?, pen_cnt = ?, status = ?, confirmed_at = ?, confirmed_by = ? WHERE match_id = ? AND team_id = ? AND judge_id = ?')
    .run(patch.points ?? row.points, patch.sheet !== undefined ? patch.sheet : row.sheet, patch.penCnt ?? row.pen_cnt, 'modified', Date.now(), actorId, ...key);
  logAudit(actorId, 'modify', 'score', `${matchId}/${teamId}`, { judgeId, prev: row, patch });
  return true;
}

// 순위(부문 내): 최고점 → 1차+2차 점수 합 → 감점 적은 순 → 팀 ID. 최고점이 같으면 공동 순위(화면에서 1,2,2,3… 표기). 확정(confirmed/modified)만 점수로 반영.
// 명단(teams)에 올라온 팀은 확정 점수가 없어도 total=0으로 포함해 순위판에 그대로 띄운다.
// r1/r2 는 각 라운드의 확정 최고점 — 1R→2R 흐름을 화면에 그대로 보여주기 위해 낸다.
const standingsStmt = db.prepare(`
  SELECT teamId, teamName, teamOrg, cat, total, sumPts AS sum, pen, r1, r2 FROM (
    SELECT t.id AS teamId, t.name AS teamName, t.org AS teamOrg, t.cat AS cat,
      COALESCE(MAX(CASE WHEN s.status IN ('confirmed','modified') THEN s.points END), 0) AS total,
      COALESCE(SUM(CASE WHEN s.status IN ('confirmed','modified') THEN s.pen_cnt END), 0) AS pen,
      COALESCE(SUM(CASE WHEN s.status IN ('confirmed','modified') THEN s.points END), 0) AS sumPts,
      MAX(CASE WHEN s.status IN ('confirmed','modified') AND m.round = 1 THEN s.points END) AS r1,
      MAX(CASE WHEN s.status IN ('confirmed','modified') AND m.round = 2 THEN s.points END) AS r2
    FROM teams t LEFT JOIN scores s ON s.team_id = t.id LEFT JOIN matches m ON m.id = s.match_id
    GROUP BY t.id
  ) ORDER BY cat, total DESC, COALESCE(r1, 0) + COALESCE(r2, 0) DESC, pen ASC, teamId
`);
export const getStandings = () => standingsStmt.all() as Standing[];

// 진행 단계 잠금: 부문별로 1차 → 2차 → 토너먼트 순서를 강제한다.
// - 2차 열림: 그 부문 1차 경기가 전부 제출됨 (대기·확정·정정 중 하나라도 있으면 제출로 본다, 반려 제외)
// - 토너먼트 열림: 1·2차 경기가 전부 확정(confirmed/modified)됨 — 순위가 확정 점수만 반영하므로
export type RoundProgress = { total: number; submitted: number; confirmed: number };
export type CatProgress = { r1: RoundProgress; r2: RoundProgress; round2Open: boolean; tournamentOpen: boolean };
export type Progress = Record<'J' | 'S', CatProgress>;
const progressStmt = db.prepare(`
  SELECT m.cat AS cat, m.round AS round, COUNT(DISTINCT m.id) AS total,
    COUNT(DISTINCT CASE WHEN s.status IN ('pending','confirmed','modified') THEN m.id END) AS submitted,
    COUNT(DISTINCT CASE WHEN s.status IN ('confirmed','modified') THEN m.id END) AS confirmed
  FROM matches m LEFT JOIN scores s ON s.match_id = m.id AND s.team_id = m.team_id
  GROUP BY m.cat, m.round
`);
export function getProgress(): Progress {
  const rows = progressStmt.all() as { cat: 'J' | 'S'; round: 1 | 2; total: number; submitted: number; confirmed: number }[];
  const empty = (): RoundProgress => ({ total: 0, submitted: 0, confirmed: 0 });
  const out = { J: { r1: empty(), r2: empty() }, S: { r1: empty(), r2: empty() } } as Record<'J' | 'S', { r1: RoundProgress; r2: RoundProgress }>;
  for (const r of rows) out[r.cat][r.round === 1 ? 'r1' : 'r2'] = { total: r.total, submitted: r.submitted, confirmed: r.confirmed };
  const done = (p: RoundProgress, key: 'submitted' | 'confirmed') => p[key] >= p.total;
  const build = (c: 'J' | 'S'): CatProgress => ({
    ...out[c],
    round2Open: done(out[c].r1, 'submitted'),
    tournamentOpen: done(out[c].r1, 'confirmed') && done(out[c].r2, 'confirmed'),
  });
  return { J: build('J'), S: build('S') };
}

// 명단 교체 가능 여부 — 점수가 하나라도 있으면 교체하지 못하게 막는다 (고아 데이터 방지)
export function countScores(): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM scores').get() as { c: number }).c;
}

// 한 팀의 채점 표(심판별 점수). 채점지 원본(sheet)은 포함하지 않는다.
const teamScores = db.prepare(`
  SELECT match_id AS matchId, judge_id AS judgeId, points, ts, status
  FROM scores WHERE team_id = ? ORDER BY match_id, judge_id
`);
export const getTeamScores = (teamId: string) => teamScores.all(teamId) as TeamScore[];

const pendingStmt = db.prepare(`
  SELECT s.match_id AS matchId, s.team_id AS teamId, t.name AS teamName,
         s.judge_id AS judgeId, u.name AS judgeName, s.points, s.ts, s.status
  FROM scores s
  LEFT JOIN teams t ON t.id = s.team_id
  LEFT JOIN users u ON u.id = s.judge_id
  WHERE s.status = 'pending'
  ORDER BY s.ts DESC
  LIMIT 200
`);
// 총수를 함께 낸다 — 상한(200)을 넘으면 클라이언트가 "더 있음"을 알 수 있다.
export function getPending(): { pending: PendingScore[]; total: number } {
  const total = (db.prepare("SELECT COUNT(*) AS c FROM scores WHERE status = 'pending'").get() as { c: number }).c;
  return { pending: pendingStmt.all() as PendingScore[], total };
}

// 필터와 동일한 조건의 총수를 함께 낸다. round 는 경기 테이블의 컬럼으로 조인해 본다 (ID 문자열 파싱에 의존하지 않음).
export function listScores(filter: { status?: ScoreStatus; cat?: 'J' | 'S'; round?: 1 | 2; judgeId?: string }): { scores: (TeamScore & { teamId: string; cat: 'J' | 'S' | null })[]; total: number } {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (filter.status) { where.push('s.status = ?'); args.push(filter.status); }
  if (filter.cat) { where.push('t.cat = ?'); args.push(filter.cat); }
  if (filter.round) { where.push('m.round = ?'); args.push(filter.round); }
  if (filter.judgeId) { where.push('s.judge_id = ?'); args.push(filter.judgeId); }
  const join = `FROM scores s LEFT JOIN teams t ON t.id = s.team_id ${filter.round ? 'JOIN matches m ON m.id = s.match_id' : ''}`;
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) AS c ${join} ${whereSql}`).get(...args) as { c: number }).c;
  const rows = db.prepare(`SELECT s.match_id AS matchId, s.team_id AS teamId, s.judge_id AS judgeId, s.points, s.ts, s.status, t.cat AS cat
    ${join} ${whereSql}
    ORDER BY s.match_id, s.team_id, s.judge_id LIMIT 5000`).all(...args) as (TeamScore & { teamId: string; cat: 'J' | 'S' | null })[];
  return { scores: rows, total };
}

// 관리자 점수표 PDF 출력용: 부문·라운드별 채점지 원본(sheet, 서명 이미지 포함).
// 서명이 없는 점수만 있는 행(sheet IS NULL)은 제외한다.
export type ScoreSheetRow = {
  matchId: string;
  teamId: string;
  teamName: string | null;
  members: string[]; // 첫 번째가 팀장
  judgeId: string;
  judgeName: string | null;
  round: 1 | 2;
  cat: 'J' | 'S' | null;
  wave: 'A' | 'B' | null;
  table: number | null;
  field: '좌' | '우' | null;
  points: number;
  status: ScoreStatus;
  ts: number;
  sheet: Record<string, unknown>;
};

export function listSheets(filter: { cat?: 'J' | 'S'; round?: 1 | 2; matchId?: string; teamId?: string; judgeId?: string }): ScoreSheetRow[] {
  const where = ['s.sheet IS NOT NULL'];
  const args: (string | number)[] = [];
  if (filter.matchId) { where.push('s.match_id = ?'); args.push(filter.matchId); }
  if (filter.teamId) { where.push('s.team_id = ?'); args.push(filter.teamId); }
  if (filter.judgeId) { where.push('s.judge_id = ?'); args.push(filter.judgeId); }
  if (filter.cat) { where.push('t.cat = ?'); args.push(filter.cat); }
  if (filter.round) { where.push('m.round = ?'); args.push(filter.round); }
  const rows = db.prepare(`
    SELECT s.match_id AS matchId, s.team_id AS teamId, t.name AS teamName, t.members,
           s.judge_id AS judgeId, u.name AS judgeName,
           m.round AS round, t.cat AS cat, m.wave AS wave, m.table_no AS "table", m.field AS field,
           s.points, s.status, s.ts, s.sheet
    FROM scores s
    LEFT JOIN matches m ON m.id = s.match_id
    LEFT JOIN teams t ON t.id = s.team_id
    LEFT JOIN users u ON u.id = s.judge_id
    WHERE ${where.join(' AND ')}
    ORDER BY m.round, t.cat, s.match_id, s.team_id, s.judge_id
    LIMIT 2000`).all(...args) as (Omit<ScoreSheetRow, 'members' | 'sheet'> & { members: string | null; sheet: string })[];
  return rows.map((r) => ({
    ...r,
    members: JSON.parse(r.members ?? '[]') as string[],
    sheet: JSON.parse(r.sheet) as Record<string, unknown>,
  }));
}
