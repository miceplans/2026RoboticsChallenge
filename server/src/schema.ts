// users·teams 테이블 DDL 의 단일 출처.
// server/src/db.ts 와 lib/contest-db.ts(Next) 가 함께 쓴다 — 이 파일만 바꾸면 양쪽에 반영된다.
// 나머지 테이블(matches, scores, ...)은 server/src/db.ts 가 정의한다.
export const USERS_DDL = `
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

export const TEAMS_DDL = `
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
