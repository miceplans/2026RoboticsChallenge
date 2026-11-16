import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
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

export const db = new DatabaseSync(DB_PATH);
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

  CREATE TABLE IF NOT EXISTS tournament_submissions (
    cat      TEXT NOT NULL CHECK (cat IN ('J','S')),
    round    TEXT NOT NULL CHECK (round IN ('QF','SF','F','3P')),
    game_no  INTEGER NOT NULL,
    score_a  REAL NOT NULL,
    score_b  REAL NOT NULL,
    judge_id TEXT NOT NULL,
    ts       INTEGER NOT NULL,
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

export function listSheets(filter: { cat?: 'J' | 'S'; round?: 1 | 2 }): ScoreSheetRow[] {
  const where = ['s.sheet IS NOT NULL'];
  const args: (string | number)[] = [];
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
    db.prepare('DELETE FROM tournament_submissions').run();
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

// 계정·토너먼트 로직은 accounts.ts · tournament.ts 에 있다. 기존 임포트 경로를 유지하기 위해 다시 낸다.
export * from './accounts.ts';
export * from './tournament.ts';
