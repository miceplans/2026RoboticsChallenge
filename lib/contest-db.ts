import { DatabaseSync } from 'node:sqlite';

// Next(로그인·가입 서버 액션)가 contest.db 를 여는 공용 접속.
// realtime 서버와 같은 파일을 쓴다 (WAL + busy_timeout — 서버와 같은 패턴).
// users·teams DDL 의 단일 출처는 server/src/schema.ts — 아래 블록은 scripts/sync-schema.mjs 가 복사한다.
const DB_PATH = process.env.CONTEST_DB_PATH ?? 'server/contest.db';

let db: DatabaseSync | null = null;

// <sync-schema:start> (server/src/schema.ts 에서 자동 복사 — 직접 고치지 말 것)
const USERS_DDL = `
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','judge','admin')),
    team_id       TEXT,
    judge_table   INTEGER,
    salt          TEXT NOT NULL,
    hash          TEXT NOT NULL,
    must_change   INTEGER NOT NULL DEFAULT 0,
    token_version INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL,
    last_login_at INTEGER
  );
  CREATE UNIQUE INDEX IF NOT EXISTS users_team_member ON users (team_id, name) WHERE role = 'user';
`;
const TEAMS_DDL = `
CREATE TABLE IF NOT EXISTS teams (
    id      TEXT PRIMARY KEY,
    cat     TEXT NOT NULL CHECK (cat IN ('J','S')),
    code    TEXT NOT NULL,
    name    TEXT NOT NULL UNIQUE,
    region  TEXT,
    org     TEXT,
    coach   TEXT,
    members TEXT NOT NULL
  );
`;
// <sync-schema:end>

export function getDb(): DatabaseSync {
  if (!db) {
    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA busy_timeout = 5000');
    db.exec(`${USERS_DDL}\n${TEAMS_DDL}`);
    // 옛 DB 에 없는 컬럼은 추가한다 (스키마 정의는 server/src/db.ts)
    for (const col of ['token_version INTEGER NOT NULL DEFAULT 0']) {
      const name = col.split(' ')[0];
      if (!(db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).some((c) => c.name === name)) {
        db.exec(`ALTER TABLE users ADD COLUMN ${col}`);
      }
    }
  }
  return db;
}

// 가입 검증용. 팀 이름이 명단과 정확히 같아야 가입할 수 있다.
export function findTeamByName(name: string): { id: string; cat: 'J' | 'S'; name: string; members: string[] } | null {
  const row = getDb().prepare('SELECT id, cat, name, members FROM teams WHERE name = ?').get(name) as { id: string; cat: 'J' | 'S'; name: string; members: string } | undefined;
  return row ? { ...row, members: JSON.parse(row.members) as string[] } : null;
}
