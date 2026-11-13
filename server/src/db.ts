import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { randomBytes, scryptSync } from 'node:crypto';
import { DEFAULT_TEAMS } from './defaults.ts';
import { TEAMS_DDL, USERS_DDL } from './schema.ts';

// 대회 운영 데이터 전부를 담는 단일 SQLite 파일 (scores + users + teams + ...).
// Next 와 이 서버가 같은 호스트에서 같은 파일을 연다 (WAL + busy_timeout, lib/users.ts 와 같은 패턴).
const DB_PATH = process.env.DB_PATH ?? 'contest.db';
// 파일을 열기 전에 신규 여부를 본다 — 열어 버리면 빈 파일이 생겨 existsSync 가 항상 참이 된다
const isNewDb = !existsSync(DB_PATH);

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
export type Standing = { teamId: string; cat: 'J' | 'S'; total: number; sum: number; pen: number; r1: number | null; r2: number | null };
export type TeamScore = { matchId: string; judgeId: string; points: number; ts: number; status: ScoreStatus };
export type Team = {
  id: string;
  cat: 'J' | 'S';
  code: string;
  name: string;
  region: string;
  org: string;
  coach: string;
  members: string[]; // 첫 번째가 팀장
};
export type Match = {
  id: string;
  round: 1 | 2;
  cat: 'J' | 'S';
  wave: 'A' | 'B';
  table: number;
  field: '좌' | '우';
  team: string;
};
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
export type AuditAction =
  | 'submit'
  | 'confirm'
  | 'modify'
  | 'reject'
  | 'teams'
  | 'matches'
  | 'settings'
  | 'template'
  | 'issue'
  | 'reset_password'
  | 'tournament'
  | 'login';
export type AuditEntry = { id: number; ts: number; actorId: string; actorName?: string | null; action: AuditAction; entity: string; entityId: string | null; detail: unknown };
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
};

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;

  ${USERS_DDL}
  ${TEAMS_DDL}

  CREATE TABLE IF NOT EXISTS matches (
    id       TEXT PRIMARY KEY,
    round    INTEGER NOT NULL CHECK (round IN (1,2)),
    cat      TEXT NOT NULL CHECK (cat IN ('J','S')),
    wave     TEXT NOT NULL CHECK (wave IN ('A','B')),
    table_no INTEGER NOT NULL,
    field    TEXT NOT NULL CHECK (field IN ('좌','우')),
    team_id  TEXT NOT NULL REFERENCES teams(id)
  );

  CREATE TABLE IF NOT EXISTS judge_assignments (
    judge_id TEXT NOT NULL,
    round    INTEGER NOT NULL,
    table_no INTEGER NOT NULL,
    PRIMARY KEY (judge_id, round)
  );

  CREATE TABLE IF NOT EXISTS scores (
    match_id     TEXT NOT NULL,
    team_id      TEXT NOT NULL,
    judge_id     TEXT NOT NULL,
    points       REAL NOT NULL,
    ts           INTEGER NOT NULL,
    sheet        TEXT,
    status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','modified','rejected')),
    pen_cnt      INTEGER NOT NULL DEFAULT 0,
    confirmed_at INTEGER,
    confirmed_by TEXT,
    PRIMARY KEY (match_id, team_id, judge_id)
  );

  CREATE TABLE IF NOT EXISTS score_audit (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    ts        INTEGER NOT NULL,
    actor_id  TEXT NOT NULL,
    action    TEXT NOT NULL,
    entity    TEXT NOT NULL,
    entity_id TEXT,
    detail    TEXT
  );
  CREATE INDEX IF NOT EXISTS score_audit_ts ON score_audit (ts DESC);

  CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tournament_slots (
    cat     TEXT NOT NULL CHECK (cat IN ('J','S')),
    slot_no INTEGER NOT NULL CHECK (slot_no BETWEEN 1 AND 8),
    team_id TEXT,
    PRIMARY KEY (cat, slot_no)
  );

  CREATE TABLE IF NOT EXISTS tournament_games (
    cat        TEXT NOT NULL CHECK (cat IN ('J','S')),
    round      TEXT NOT NULL CHECK (round IN ('QF','SF','F','3P')),
    game_no    INTEGER NOT NULL,
    team_a     TEXT,
    team_b     TEXT,
    score_a    REAL,
    score_b    REAL,
    winner     TEXT,
    status     TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','done')),
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (cat, round, game_no)
  );
`);

// 옛날 scores.db (sheet/status 컬럼 없음) 를 그대로 쓸 수 있게 컬럼을 추가한다
for (const col of ['sheet TEXT', "status TEXT NOT NULL DEFAULT 'pending'", 'pen_cnt INTEGER NOT NULL DEFAULT 0', 'confirmed_at INTEGER', 'confirmed_by TEXT']) {
  const name = col.split(' ')[0];
  if (!(db.prepare('PRAGMA table_info(scores)').all() as { name: string }[]).some((c) => c.name === name)) {
    db.exec(`ALTER TABLE scores ADD COLUMN ${col}`);
  }
}

// 예선 순위 상위 8팀이 8강(QF)부터 시작하는 구조로 바뀐 뒤에는 옛 스키마(16슬롯·16강) 테이블을 백업한다.
// 데이터가 있으면 지우지 않고 이름을 바꿔 보존 — 운영 DB 에서 경고 없이 날아가는 일이 없게.
{
  const ddlOf = (name: string) => (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) as { sql: string } | undefined)?.sql ?? '';
  const backupIf = (name: string, stale: (sql: string) => boolean) => {
    const ddl = ddlOf(name);
    if (ddl && stale(ddl)) {
      const cnt = (db.prepare(`SELECT COUNT(*) AS c FROM ${name}`).get() as { c: number }).c;
      const backup = `${name}_backup_${Date.now()}`;
      db.exec(`ALTER TABLE ${name} RENAME TO ${backup}`);
      console.log(`old ${name} moved to ${backup}${cnt > 0 ? ` (${cnt} rows preserved)` : ' (was empty)'}`);
    }
  };
  backupIf('tournament_slots', (sql) => sql.includes('BETWEEN 1 AND 16'));
  backupIf('tournament_games', (sql) => sql.includes("'R16'"));
}
db.exec(`
  CREATE TABLE IF NOT EXISTS tournament_slots (
    cat     TEXT NOT NULL CHECK (cat IN ('J','S')),
    slot_no INTEGER NOT NULL CHECK (slot_no BETWEEN 1 AND 8),
    team_id TEXT,
    PRIMARY KEY (cat, slot_no)
  );

  CREATE TABLE IF NOT EXISTS tournament_games (
    cat        TEXT NOT NULL CHECK (cat IN ('J','S')),
    round      TEXT NOT NULL CHECK (round IN ('QF','SF','F','3P')),
    game_no    INTEGER NOT NULL,
    team_a     TEXT,
    team_b     TEXT,
    score_a    REAL,
    score_b    REAL,
    winner     TEXT,
    status     TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','done')),
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (cat, round, game_no)
  );
`);

// 옛 DB 에 없는 컬럼은 추가한다 (token_version 등)
for (const col of ['token_version INTEGER NOT NULL DEFAULT 0']) {
  const name = col.split(' ')[0];
  if (!(db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).some((c) => c.name === name)) {
    db.exec(`ALTER TABLE users ADD COLUMN ${col}`);
  }
}

// contest.db 가 없고 기존 scores.db/users.db 만 있으면 데이터를 이어 받는다 (개발/운영 경로 마이그레이션)
if (isNewDb) {
  const migrated: string[] = [];
  const stmts: string[] = [];
  if (existsSync('scores.db') || existsSync('../scores.db')) {
    const p = existsSync('scores.db') ? 'scores.db' : '../scores.db';
    stmts.push(
      `ATTACH '${p}' AS olds`,
      `INSERT INTO scores (match_id, team_id, judge_id, points, ts, sheet, status, pen_cnt, confirmed_at, confirmed_by)
        SELECT match_id, team_id, judge_id, points, ts, sheet, 'confirmed', 0, ts, judge_id FROM olds.scores`,
      'DETACH olds',
    );
    migrated.push('scores');
  }
  if (existsSync('users.db') || existsSync('../users.db')) {
    const p = existsSync('users.db') ? 'users.db' : '../users.db';
    stmts.push(
      `ATTACH '${p}' AS oldu`,
      `INSERT OR IGNORE INTO users (id, name, role, team_id, salt, hash, must_change, created_at)
        SELECT id, name, 'user', team_id, salt, hash, 0, created_at FROM oldu.users`,
      'DETACH oldu',
    );
    migrated.push('users');
  }
  if (stmts.length) {
    db.exec(stmts.join(';\n'));
    console.log(`migrated from ${migrated.join(' and ')}.db`);
  }
}

// --- settings (메모리 캐시, 관리자 변경 즉시 반영) ---

const settingsCache = new Map<string, string>();
{
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  for (const r of rows) settingsCache.set(r.key, r.value);
}

export function getSetting(key: string, def: string): string {
  return settingsCache.get(key) ?? def;
}
export function getSettingJson<T>(key: string, def: T): T {
  const raw = settingsCache.get(key);
  if (!raw) return def;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return def;
  }
}
export function setSetting(key: string, value: string): void {
  db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').run(key, value, Date.now());
  settingsCache.set(key, value);
}
export function deleteSetting(key: string): void {
  db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  settingsCache.delete(key);
}
export const autoConfirm = () => getSetting('auto_confirm', '0') === '1';
export const boardPublic = () => getSetting('board_public', '1') === '1';
export const hideScores = () => getSetting('hide_scores', '0') === '1';
export const getNotice = () => getSettingJson('notice', { message: '', updatedAt: 0 });
// 설정이 마지막으로 바뀐 시각 — /config 의 updatedAt(캐시 비교용)으로 쓴다. 요청할 때마다 새 값을 내는 게 아니다.
export function getConfigVersion(): number {
  return (db.prepare('SELECT COALESCE(MAX(updated_at), 0) AS m FROM settings').get() as { m: number }).m;
}
export const getTemplate = (): unknown => getSettingJson<unknown | null>('template', null);
export const getRoundScores = (): Record<string, { r1: string; r2: string }> => getSettingJson('round_scores', {});
export const setTemplate = (items: unknown): void => setSetting('template', JSON.stringify(items));

// 당일 진행 순서: 테이블 실행 순서 (1~8 순열). 설정이 없거나 깨졌으면 1~8 기본값.
export function getTableOrder(): number[] {
  const raw = getSettingJson<unknown>('table_order', null);
  const arr = Array.isArray(raw) ? raw.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= 8) : [];
  const uniq = [...new Set(arr)];
  for (let n = 1; n <= 8; n++) if (!uniq.includes(n)) uniq.push(n);
  return uniq;
}

// 관리자 순위 조정: 부문별 팀 ID 배열. 있으면 클라이언트가 계산 순위 대신 이 순서를 쓴다 (동점 8위 결정·드래그 조정).
export function getRankOrder(): { S?: string[]; J?: string[] } {
  const raw = getSettingJson<{ S?: unknown; J?: unknown }>('rank_order', {});
  const pick = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined);
  const out: { S?: string[]; J?: string[] } = {};
  const s = pick(raw?.S); const j = pick(raw?.J);
  if (s?.length) out.S = s;
  if (j?.length) out.J = j;
  return out;
}
export function resetTemplate(): void {
  db.prepare("DELETE FROM settings WHERE key = 'template'").run();
  settingsCache.delete('template');
}

// --- 감사 로그 ---

const insertAudit = db.prepare('INSERT INTO score_audit (ts, actor_id, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?, ?)');
export function logAudit(actorId: string, action: AuditAction, entity: string, entityId: string | null, detail: unknown): void {
  insertAudit.run(Date.now(), actorId, action, entity, entityId, detail === undefined ? null : JSON.stringify(detail));
}
export function getActivity(limit: number): AuditEntry[] {
  const rows = db.prepare(`SELECT a.id, a.ts, a.actor_id AS actorId, u.name AS actorName, a.action, a.entity, a.entity_id AS entityId, a.detail
    FROM score_audit a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.id DESC LIMIT ?`).all(Math.min(limit, 500)) as (Omit<AuditEntry, 'detail'> & { detail: string | null })[];
  return rows.map((r) => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null }));
}

// 대시보드 집계: 경기 진행, 확정 대기, 심판별 제출, 접속 현황
export type Overview = {
  matches: { total: number; done: number };
  pendingCount: number;
  judges: { id: string; name: string; table: number | null; submitted: number; total: number }[];
  users: { total: number; active24h: number; neverLoggedIn: number };
  scores: { total: number; pending: number; confirmed: number; modified: number; rejected: number };
};
export function getOverview(): Overview {
  const matchTotal = (db.prepare('SELECT COUNT(*) AS c FROM matches').get() as { c: number }).c;
  const matchDone = (db.prepare("SELECT COUNT(DISTINCT match_id) AS c FROM scores WHERE status != 'rejected'").get() as { c: number }).c;
  const pendingCount = (db.prepare("SELECT COUNT(*) AS c FROM scores WHERE status = 'pending'").get() as { c: number }).c;
  const judges = (db.prepare('SELECT id, name, judge_table AS "table" FROM users WHERE role = \'judge\' ORDER BY id').all() as { id: string; name: string; table: number | null }[]).map((j) => {
    const total = j.table ? (db.prepare('SELECT COUNT(*) AS c FROM matches WHERE table_no = ?').get(j.table) as { c: number }).c : 0;
    const submitted = (db.prepare("SELECT COUNT(DISTINCT match_id) AS c FROM scores WHERE judge_id = ? AND status != 'rejected'").get(j.id) as { c: number }).c;
    return { ...j, submitted, total };
  });
  const userTotal = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
  const active24h = (db.prepare('SELECT COUNT(*) AS c FROM users WHERE last_login_at > ?').get(Date.now() - 24 * 3600_000) as { c: number }).c;
  const neverLoggedIn = (db.prepare('SELECT COUNT(*) AS c FROM users WHERE last_login_at IS NULL').get() as { c: number }).c;
  const scoreRows = db.prepare('SELECT status, COUNT(*) AS c FROM scores GROUP BY status').all() as { status: ScoreStatus; c: number }[];
  const byStatus = Object.fromEntries(scoreRows.map((r) => [r.status, r.c]));
  return {
    matches: { total: matchTotal, done: matchDone },
    pendingCount,
    judges,
    users: { total: userTotal, active24h, neverLoggedIn },
    scores: {
      total: scoreRows.reduce((s, r) => s + r.c, 0),
      pending: byStatus.pending ?? 0,
      confirmed: byStatus.confirmed ?? 0,
      modified: byStatus.modified ?? 0,
      rejected: byStatus.rejected ?? 0,
    },
  };
}

// --- 점수 ---

const getScore = db.prepare('SELECT ts, status, points, sheet, pen_cnt FROM scores WHERE match_id = ? AND team_id = ? AND judge_id = ?');
const insertScore = db.prepare(`INSERT INTO scores (match_id, team_id, judge_id, points, ts, sheet, status, pen_cnt, confirmed_at, confirmed_by)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const updateScore = db.prepare(`UPDATE scores SET points = ?, ts = ?, sheet = ?, status = ?, pen_cnt = ?, confirmed_at = ?, confirmed_by = ?
  WHERE match_id = ? AND team_id = ? AND judge_id = ? AND ? > ts`);

// 심판 제출 upsert.
// - 더 오래된 ts 면 무시 (멱등).
// - 심판은 서명 후 스스로 고칠 수 없다: 확정(confirmed)·관리자 정정(modified) 행은 재전송이 덮지 못한다.
//   정정은 관리자 확인(modify/반려 후 재제출)을 거친다. 복구(resendAll) 재전송은 원래 ts 를 그대로 쓰므로 무시되지 않는다.
// - 반려(rejected) 상태면 더 새로운 ts 로 다시 제출해 확정 절차를 다시 거칠 수 있다.
export function saveScore(s: ScoreInput): { written: boolean; status: ScoreStatus } {
  const key = [s.matchId, s.teamId, s.judgeId] as const;
  db.exec('BEGIN');
  try {
    const row = getScore.get(...key) as { ts: number; status: ScoreStatus } | undefined;
    if (!row) {
      const status: ScoreStatus = autoConfirm() ? 'confirmed' : 'pending';
      insertScore.run(s.matchId, s.teamId, s.judgeId, s.points, s.ts, s.sheet, status, s.penCnt ?? 0, status === 'confirmed' ? Date.now() : null, status === 'confirmed' ? s.judgeId : null);
      logAudit(s.judgeId, 'submit', 'score', `${s.matchId}/${s.teamId}`, { points: s.points, status });
      db.exec('COMMIT');
      return { written: true, status };
    }
    if (s.ts <= row.ts || row.status === 'modified' || row.status === 'confirmed') {
      db.exec('COMMIT');
      return { written: false, status: row.status };
    }
    const status: ScoreStatus = autoConfirm() ? 'confirmed' : 'pending';
    updateScore.run(s.points, s.ts, s.sheet, status, s.penCnt ?? 0, status === 'confirmed' ? Date.now() : null, status === 'confirmed' ? s.judgeId : null, ...key, s.ts);
    logAudit(s.judgeId, 'submit', 'score', `${s.matchId}/${s.teamId}`, { points: s.points, prevStatus: row.status, status });
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

// 순위(부문 내): 최고점 → 조별 합계 → 감점 적은 순 → 팀 ID. 확정(confirmed/modified)만 점수로 반영.
// 명단(teams)에 올라온 팀은 확정 점수가 없어도 total=0으로 포함해 순위판에 그대로 띄운다.
// r1/r2 는 각 라운드의 확정 최고점 — 1R→2R 흐름을 화면에 그대로 보여주기 위해 낸다.
const standingsStmt = db.prepare(`
  SELECT teamId, cat, total, sumPts AS sum, pen, r1, r2 FROM (
    SELECT t.id AS teamId, t.cat AS cat,
      COALESCE(MAX(CASE WHEN s.status IN ('confirmed','modified') THEN s.points END), 0) AS total,
      COALESCE(SUM(CASE WHEN s.status IN ('confirmed','modified') THEN s.pen_cnt END), 0) AS pen,
      COALESCE(SUM(CASE WHEN s.status IN ('confirmed','modified') THEN s.points END), 0) AS sumPts,
      MAX(CASE WHEN s.status IN ('confirmed','modified') AND m.round = 1 THEN s.points END) AS r1,
      MAX(CASE WHEN s.status IN ('confirmed','modified') AND m.round = 2 THEN s.points END) AS r2
    FROM teams t LEFT JOIN scores s ON s.team_id = t.id LEFT JOIN matches m ON m.id = s.match_id
    GROUP BY t.id
  ) ORDER BY cat, total DESC, sumPts DESC, pen ASC, teamId
`);
export const getStandings = () => standingsStmt.all() as Standing[];

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

// --- 팀 · 대진 ---

const listTeamsStmt = db.prepare('SELECT id, cat, code, name, region, org, coach, members FROM teams ORDER BY id');
export function listTeams(): Team[] {
  return (listTeamsStmt.all() as (Omit<Team, 'members'> & { members: string })[]).map((t) => ({ ...t, members: JSON.parse(t.members) as string[] }));
}

// 전체 교체 (관리자 명단 Import). 점수가 있으면 엔드포인트에서 이미 막는다.
// 팀 ID 를 참조하는 나머지 데이터(대진·토너먼트 배정·경기)도 함께 비워 고아가 생기지 않게 한다.
export function replaceTeams(teams: Team[]): void {
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM tournament_games').run();
    db.prepare('DELETE FROM tournament_slots').run();
    db.prepare('DELETE FROM matches').run();
    db.prepare('DELETE FROM teams').run();
    const ins = db.prepare('INSERT INTO teams (id, cat, code, name, region, org, coach, members) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const t of teams) ins.run(t.id, t.cat, t.code, t.name, t.region ?? null, t.org ?? null, t.coach ?? null, JSON.stringify(t.members));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

const listMatchesStmt = db.prepare('SELECT id, round, cat, wave, table_no AS "table", field, team_id AS team FROM matches ORDER BY id');
export const listMatches = () => listMatchesStmt.all() as Match[];

// 제출 검증용: 경기가 실제 대진에 있는지, 그리고 그 경기의 팀이 맞는지 본다.
export function getMatch(id: string): Match | null {
  return (db.prepare('SELECT id, round, cat, wave, table_no AS "table", field, team_id AS team FROM matches WHERE id = ?').get(id) as Match | undefined) ?? null;
}

// 심판의 담당 테이블. REF01~REF08 는 ID 에서 고정, 그 외는 발급/배정된 judge_table.
const REF_TABLE = /^REF0?([1-8])$/i;
export function judgeTableOf(judgeId: string): number | null {
  const fromId = REF_TABLE.exec(judgeId)?.[1];
  if (fromId) return Number(fromId);
  return getJudgeTables()[judgeId] ?? null;
}

export function replaceMatches(matches: Match[]): void {
  db.exec('BEGIN');
  try {
    const teamExists = db.prepare('SELECT COUNT(*) AS c FROM teams WHERE id = ?');
    for (const m of matches) {
      if ((teamExists.get(m.team) as { c: number }).c === 0) throw new Error(`unknown_team:${m.team}`);
    }
    db.prepare('DELETE FROM matches').run();
    const ins = db.prepare('INSERT INTO matches (id, round, cat, wave, table_no, field, team_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const m of matches) ins.run(m.id, m.round, m.cat, m.wave, m.table, m.field, m.team);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// --- 토너먼트 ---

export function getTournament(): Tournament {
  const slots = db.prepare('SELECT cat, slot_no AS slotNo, team_id AS teamId FROM tournament_slots ORDER BY cat, slot_no').all() as Tournament['slots'];
  const games = db.prepare(`SELECT cat, round, game_no AS gameNo, team_a AS teamA, team_b AS teamB, score_a AS scoreA, score_b AS scoreB,
    winner, status, updated_at AS updatedAt FROM tournament_games ORDER BY cat, round, game_no`).all() as unknown as Tournament['games'];
  return { slots, games };
}

// 토너먼트 8슬롯 배정 저장 (전체 교체). 빈 칸은 null 로 저장한다.
// 배정이 바뀌면 기존 경기 결과는 무효 — 다시 입력해야 한다.
export function saveTournamentSlots(cat: 'J' | 'S', teamIds: (string | null)[]): void {
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM tournament_slots WHERE cat = ?').run(cat);
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

// 결과 하나를 저장하고 해당 부문 전체를 일관되게 다시 계산한다 (승자 진출·3·4위전 패자 배정).
// 더 아래 라운드에 이미 입력된 결과는 무효가 된다 — 바뀐 대진으로 다시 치러야 하므로.
export function saveTournamentResult(cat: 'J' | 'S', round: TournamentRound, gameNo: number, scoreA: number, scoreB: number): void {
  if (scoreA === scoreB) throw new Error('tie_score');
  db.exec('BEGIN');
  try {
    const keepIdx = ROUND_ORDER.indexOf(round);
    const results = new Map<string, { scoreA: number; scoreB: number }>();
    const rows = db.prepare("SELECT round, game_no, score_a, score_b FROM tournament_games WHERE cat = ? AND status = 'done'").all(cat) as { round: string; game_no: number; score_a: number; score_b: number }[];
    for (const r of rows) {
      if (ROUND_ORDER.indexOf(r.round as TournamentRound) <= keepIdx) results.set(`${r.round}-${r.game_no}`, { scoreA: r.score_a, scoreB: r.score_b });
    }
    results.set(`${round}-${gameNo}`, { scoreA, scoreB });
    rebuildTournament(cat, results);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// 슬롯 배정 + 입력된 결과들로 경기 테이블 전체를 재구축한다.
// 8강(QF 4경기) → 준결승(2) → 결승, 준결승 패자는 3·4위전. 팀이 채워지지 않거나 결과가 없는 경기는 예정 상태로 둔다.
// 슬롯 2j-1 vs 2j 가 j번째 8강 경기 (홀수 승자는 A, 짝수 승자는 B).
function rebuildTournament(cat: 'J' | 'S', results?: Map<string, { scoreA: number; scoreB: number }>): void {
  const resultsMap: Map<string, { scoreA: number; scoreB: number }> =
    results ??
    new Map(
      (db.prepare("SELECT round, game_no, score_a, score_b FROM tournament_games WHERE cat = ? AND status = 'done'").all(cat) as { round: string; game_no: number; score_a: number; score_b: number }[]).map(
        (r) => [`${r.round}-${r.game_no}`, { scoreA: r.score_a, scoreB: r.score_b }],
      ),
    );
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
    g.status = 'done';
    g.winner = res.scoreA > res.scoreB ? g.teamA : g.teamB;
    return { winner: g.winner, loser: res.scoreA > res.scoreB ? g.teamB : g.teamA };
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

// --- 시드 ---

// teams 가 비어 있으면 기본 명단·대진·기본 설정을 채운다 (첫 기동).
export function seedIfEmpty(): void {
  const count = (db.prepare('SELECT COUNT(*) AS c FROM teams').get() as { c: number }).c;
  if (count > 0) return;
  db.exec('BEGIN');
  try {
    const insTeam = db.prepare('INSERT INTO teams (id, cat, code, name, region, org, coach, members) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const t of DEFAULT_TEAMS) insTeam.run(t.id, t.cat, t.code, t.name, t.region, t.org, t.coach, JSON.stringify(t.members));
    // 기본 배정 규칙은 lib/judge/data.ts 와 동일: 시니어 1~4, 주니어 5~8, 2차에 조 교환
    const insMatch = db.prepare('INSERT INTO matches (id, round, cat, wave, table_no, field, team_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const round of [1, 2] as const) {
      for (const t of DEFAULT_TEAMS) {
        const i = Number(t.id.slice(1)) - 1;
        const first = i < 8 ? 'A' : 'B';
        const k = i % 8;
        insMatch.run(`R${round}-${t.id}`, round, t.cat, round === 1 ? first : first === 'A' ? 'B' : 'A', (t.cat === 'S' ? 1 : 5) + Math.floor(k / 2), k % 2 ? '우' : '좌', t.id);
      }
    }
    db.exec('COMMIT');
    console.log(`seeded ${DEFAULT_TEAMS.length} teams and ${DEFAULT_TEAMS.length * 2} matches`);
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  if (!settingsCache.has('auto_confirm')) setSetting('auto_confirm', '0');
  if (!settingsCache.has('board_public')) setSetting('board_public', '1');
  if (!settingsCache.has('notice')) setSetting('notice', JSON.stringify({ message: '', updatedAt: Date.now() }));
}

// --- 계정 (심판·관리자 발급/재발급, 접속 현황 집계) ---

export type AccountRole = 'user' | 'judge' | 'admin';
export type AccountRow = {
  id: string;
  name: string;
  role: AccountRole;
  teamId: string | null;
  judgeTable: number | null;
  mustChange: number;
  createdAt: number;
  lastLoginAt: number | null;
};
// 발급·재발급 결과. 비밀번호는 평문으로 한 번만 돌려주고 저장하지 않는다 (해시만 저장).
export type IssuedAccount = { id: string; name: string; role: AccountRole; password: string };

export function listUsers(filter: { role?: AccountRole | 'staff'; q?: string }): { users: AccountRow[]; total: number } {
  const where: string[] = [];
  const args: string[] = [];
  if (filter.role === 'staff') where.push("role IN ('judge','admin')");
  else if (filter.role) {
    where.push('role = ?');
    args.push(filter.role);
  }
  if (filter.q) {
    where.push('(id LIKE ? OR name LIKE ?)');
    args.push(`%${filter.q}%`, `%${filter.q}%`);
  }
  const base = `FROM users ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
  const total = (db.prepare(`SELECT COUNT(*) AS c ${base}`).get(...args) as { c: number }).c;
  const sql = `SELECT id, name, role, team_id AS teamId, judge_table AS judgeTable, must_change AS mustChange,
    created_at AS createdAt, last_login_at AS lastLoginAt ${base} ORDER BY role, id LIMIT 2000`;
  return { users: db.prepare(sql).all(...args) as AccountRow[], total };
}

export function countAdmins(): number {
  return (db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get() as { c: number }).c;
}

// 심판별 담당 테이블. REF01~REF08 의 고정 규칙은 클라이언트가 ID에서 도출하고,
// 그 외 심판은 발급/배정 시 지정한 judge_table 을 쓴다.
export function getJudgeTables(): Record<string, number> {
  const rows = db.prepare("SELECT id, judge_table FROM users WHERE role = 'judge' AND judge_table IS NOT NULL").all() as { id: string; judge_table: number }[];
  return Object.fromEntries(rows.map((r) => [r.id, r.judge_table]));
}

export function assignJudgeTable(judgeId: string, table: number | null): boolean {
  const row = db.prepare("SELECT COUNT(*) AS c FROM users WHERE id = ? AND role = 'judge'").get(judgeId) as { c: number };
  if (row.c === 0) return false;
  db.prepare('UPDATE users SET judge_table = ? WHERE id = ?').run(table, judgeId);
  return true;
}

// 세션 토큰 대조: 토큰의 role·teamId·tv 가 DB 와 일치해야 유효하다.
// 비밀번호 재발급이나 권한 변경 때 tv 를 올리면 기존 세션이 즉시 무효화된다.
export function assertSessionFresh(s: { id: string; role: string; teamId?: string; tv?: number }): boolean {
  const row = db.prepare('SELECT role, team_id AS teamId, token_version AS tv FROM users WHERE id = ?').get(s.id) as { role: string; teamId: string | null; tv: number } | undefined;
  if (!row) return false;
  return row.role === s.role && (row.teamId ?? undefined) === s.teamId && row.tv === (s.tv ?? 0);
}

// 모든 계정의 세션을 한 번에 폐기 — 관리자가 침해 의심이나 대회 전에 사용.
export function revokeAllSessions(): void {
  db.exec('UPDATE users SET token_version = token_version + 1');
}

// 발급용 임시 비밀번호. base64url 8자 — 종이에 적어 나눠주기 짧고, 해시로 저장되므로 재사용핸도 안전하다.
// 계정 기본 비밀번호. 관리자가 "초기화"하면 이 값으로 돌아간다 (환경변수 DEFAULT_PASSWORD 로 변경 가능).
export const DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD || 'robotics!';
const genPassword = () => randomBytes(6).toString('base64url');

const hashPw = (password: string, salt: string) => scryptSync(password, salt, 32).toString('base64url');

// 발급·재발급 계정은 모두 must_change=1 (처음 로그인 후 비밀번호를 바꾸도록 운영에서 안내)
function insertAccount(a: { id: string; name: string; role: AccountRole; teamId?: string | null; judgeTable?: number | null; password?: string; mustChange?: boolean }): IssuedAccount {
  const password = a.password ?? genPassword();
  const salt = randomBytes(16).toString('base64url');
  db.prepare('INSERT INTO users (id, name, role, team_id, judge_table, salt, hash, must_change, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(a.id, a.name, a.role, a.teamId ?? null, a.judgeTable ?? null, salt, hashPw(password, salt), a.mustChange === false ? 0 : 1, Date.now());
  return { id: a.id, name: a.name, role: a.role, password };
}

// 계정 일괄 발급 (관리자가 올린 CSV). 하나라도 아이디가 겹치면 전체를 취소한다.
export function issueAccounts(list: { id: string; name: string; role: 'judge' | 'admin'; judgeTable?: number | null }[]): IssuedAccount[] {
  const dup = db.prepare('SELECT COUNT(*) AS c FROM users WHERE id = ?');
  for (const a of list) {
    if (!/^[a-zA-Z0-9._-]{4,32}$/.test(a.id)) throw new Error(`invalid_id:${a.id}`);
    if ((dup.get(a.id) as { c: number }).c > 0) throw new Error(`duplicate_id:${a.id}`);
  }
  const out: IssuedAccount[] = [];
  db.exec('BEGIN');
  try {
    for (const a of list) out.push(insertAccount(a));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return out;
}

// 대회 기본 계정: 팀별 1개(team-J01 …), 관리자 2개(admin, admin2), 심판 REF01~REF16. 비밀번호는 모두 DEFAULT_PASSWORD.
// 심판 1~8 은 같은 번호 테이블, 9~16 은 (번호-8)번 테이블로 기본 배정한다 (관리자 화면에서 바꿀 수 있다).
// overwrite=false(기동 시): 없는 계정만 만든다. overwrite=true(수동 스크립트): 이미 있는 계정도 비밀번호를 기본값으로 되돌린다.
export function seedDefaultAccounts(overwrite = false): { created: number; reset: number } {
  const wanted: { id: string; name: string; role: AccountRole; teamId?: string; judgeTable?: number }[] = [
    ...listTeams().map((t) => ({ id: `team-${t.id}`, name: t.name, role: 'user' as const, teamId: t.id })),
    { id: 'admin', name: '관리자 1', role: 'admin' },
    { id: 'admin2', name: '관리자 2', role: 'admin' },
    ...Array.from({ length: 16 }, (_, i) => ({ id: `REF${String(i + 1).padStart(2, '0')}`, name: `심판 ${i + 1}`, role: 'judge' as const, judgeTable: (i % 8) + 1 })),
  ];
  const exists = db.prepare('SELECT role FROM users WHERE id = ?');
  const toReset: string[] = [];
  let created = 0;
  db.exec('BEGIN');
  try {
    for (const a of wanted) {
      const row = exists.get(a.id) as { role: AccountRole } | undefined;
      if (!row) {
        insertAccount({ ...a, password: DEFAULT_PASSWORD, mustChange: false });
        created++;
      } else if (overwrite && row.role === a.role) {
        toReset.push(a.id);
      }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { created, reset: toReset.length ? resetPasswords({ ids: toReset }).length : 0 };
}

// 비밀번호 일괄 재발급. ids 로 지정하거나 역할(user/judge/admin) 전체를 대상으로 한다.
export function resetPasswords(sel: { ids?: string[]; role?: AccountRole }): IssuedAccount[] {
  const rows = sel.ids?.length
    ? (db.prepare(`SELECT id, name, role FROM users WHERE id IN (${sel.ids.map(() => '?').join(',')})`).all(...sel.ids) as { id: string; name: string; role: AccountRole }[])
    : sel.role
      ? (db.prepare('SELECT id, name, role FROM users WHERE role = ?').all(sel.role) as { id: string; name: string; role: AccountRole }[])
      : [];
  const out: IssuedAccount[] = [];
  db.exec('BEGIN');
  try {
    // 비밀번호를 바꾸면 기존 세션은 즉시 무효 (token_version 증가)
    const upd = db.prepare('UPDATE users SET salt = ?, hash = ?, must_change = 0, token_version = token_version + 1 WHERE id = ?');
    for (const r of rows) {
      const password = DEFAULT_PASSWORD;
      const salt = randomBytes(16).toString('base64url');
      upd.run(salt, hashPw(password, salt), r.id);
      out.push({ id: r.id, name: r.name, role: r.role, password });
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return out;
}

// 최초 기동 시 관리자 계정이 없으면 만든다. 비밀번호는 반드시 환경변수로만 지정한다.
// 개발에서는 server/.env 에 ADMIN_INITIAL_PASSWORD(와 선택 JUDGE_INITIAL_PASSWORD)를 두면 된다.
// 비밀번호가 없으면 계정을 만들지 않는다 — 코드에 기본 비밀번호를 두지 않기 때문.
export function bootstrapStaffIfNone(): void {
  if (countAdmins() > 0) return;
  const adminPw = process.env.ADMIN_INITIAL_PASSWORD || null;
  if (!adminPw) {
    console.warn('관리자 계정이 없고 ADMIN_INITIAL_PASSWORD 도 없어 계정을 만들지 않았습니다. server/.env(개발) 또는 배포 환경변수를 설정하세요.');
    return;
  }
  const adminId = process.env.ADMIN_INITIAL_ID ?? 'admin';
  const judgePw = process.env.JUDGE_INITIAL_PASSWORD || null;
  db.exec('BEGIN');
  try {
    insertAccount({ id: adminId, name: '관리자', role: 'admin', password: adminPw });
    if (judgePw) {
      for (let i = 1; i <= 8; i++) insertAccount({ id: `REF0${i}`, name: `심판 ${i}`, role: 'judge', judgeTable: i, password: judgePw });
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  if (process.env.NODE_ENV === 'production') console.log(`최초 관리자 계정 '${adminId}' 이 만들어졌습니다.`);
  else console.log(`개발용 계정이 만들어졌습니다: 관리자 ${adminId}, 심판 REF01~REF08 (비밀번호는 환경변수에서 확인 — 임시 비밀번호이므로 바꾸세요)`);
}
