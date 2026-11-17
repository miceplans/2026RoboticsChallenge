import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { AUDIT_DDL, MIGRATED_TABLES, SCHEMA_VERSION, USERS_INDEX } from '../schema.ts';

// 대회 운영 데이터 전부를 담는 단일 SQLite 파일 (scores + users + teams + ...).
// Next 와 이 서버가 같은 호스트에서 같은 파일을 연다 (WAL + busy_timeout, lib/users.ts 와 같은 패턴).
const DB_PATH = process.env.DB_PATH ?? 'contest.db';
// 파일을 열기 전에 신규 여부를 본다 — 열어 버리면 빈 파일이 생겨 existsSync 가 항상 참이 된다
const isNewDb = !existsSync(DB_PATH);

export const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
`);

const tableExists = (name: string) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
const columnsOf = (name: string) => (db.prepare(`PRAGMA table_info(${name})`).all() as { name: string }[]).map((c) => c.name);
const hadTables = tableExists('teams') || tableExists('scores') || tableExists('users');

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

// 옛 DB 에 없는 컬럼은 추가한다 (옛 scores.db 의 sheet/status 등, users.token_version) — 마이그레이션이 이 컬럼들을 읽는다.
if (tableExists('scores')) {
  const have = columnsOf('scores');
  for (const col of ['sheet TEXT', "status TEXT NOT NULL DEFAULT 'pending'", 'pen_cnt INTEGER NOT NULL DEFAULT 0', 'confirmed_at INTEGER', 'confirmed_by TEXT']) {
    if (!have.includes(col.split(' ')[0])) db.exec(`ALTER TABLE scores ADD COLUMN ${col}`);
  }
}
if (tableExists('users') && !columnsOf('users').includes('token_version')) db.exec('ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0');

// 없는 테이블은 최신 정의(FK 포함)로 만든다. 이미 있는 옛 테이블은 아래 마이그레이션이 옮긴다.
for (const t of MIGRATED_TABLES) if (!tableExists(t.name)) db.exec(t.ddl(t.name));
db.exec(`${USERS_INDEX}\n${AUDIT_DDL}`);

const userVersion = () => (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;

// v1: FOREIGN KEY 도입. SQLite 는 기존 테이블에 FK 를 붙일 수 없어 새 정의로 테이블을 다시 만들고 데이터를 옮긴다.
// - 시작 전에 DB 파일 전체를 백업한다 (VACUUM INTO).
// - 옮긴 뒤 foreign_key_check 에 위반이 있으면(고아 데이터) 아무것도 바꾸지 않고 롤백한 채 기동을 중단한다.
// - 안 쓰이던 judge_assignments 와 16강 시절 *_backup_* 테이블은 이때 함께 지운다 (위 파일 백업에 남는다).
if (hadTables && userVersion() < SCHEMA_VERSION) {
  const backupPath = `${DB_PATH}.pre-fk-${Date.now()}.bak`;
  db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
  console.log(`[migrate] DB 백업: ${backupPath}`);
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec('BEGIN');
    for (const t of MIGRATED_TABLES) {
      db.exec(`DROP TABLE IF EXISTS ${t.name}__new`);
      db.exec(t.ddl(`${t.name}__new`));
      db.exec(`INSERT INTO ${t.name}__new (${t.cols}) SELECT ${t.cols} FROM ${t.name}`);
    }
    for (const t of [...MIGRATED_TABLES].reverse()) db.exec(`DROP TABLE ${t.name}`);
    for (const t of MIGRATED_TABLES) db.exec(`ALTER TABLE ${t.name}__new RENAME TO ${t.name}`);
    db.exec(USERS_INDEX);
    db.exec('DROP TABLE IF EXISTS judge_assignments');
    for (const r of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%\\_backup\\_%' ESCAPE '\\'").all() as { name: string }[]) db.exec(`DROP TABLE "${r.name}"`);
    const bad = db.prepare('PRAGMA foreign_key_check').all() as { table: string; rowid: number; parent: string }[];
    if (bad.length > 0) {
      const sum = new Map<string, number>();
      for (const b of bad) sum.set(`${b.table}→${b.parent}`, (sum.get(`${b.table}→${b.parent}`) ?? 0) + 1);
      throw new Error(`FK 위반 데이터가 있어 마이그레이션을 중단합니다: ${[...sum].map(([k, n]) => `${k} ${n}건`).join(', ')} (백업: ${backupPath})`);
    }
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    db.exec('COMMIT');
    console.log('[migrate] FK 스키마(v1) 적용 완료');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* 이미 끝남 */ }
    throw e;
  }
} else if (userVersion() < SCHEMA_VERSION) {
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}
db.exec('PRAGMA foreign_keys = ON');

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
    db.exec('PRAGMA foreign_keys = OFF'); // 옛 점수/계정은 대진·심판 정보 없이 들어온다
    db.exec(stmts.join(';\n'));
    db.exec('PRAGMA foreign_keys = ON');
    console.log(`migrated from ${migrated.join(' and ')}.db`);
  }
}
