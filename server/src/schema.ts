// 모든 테이블 DDL 의 단일 출처. 신규 DB 생성과 기존 DB 의 FK 마이그레이션(db/connection.ts)이 같은 정의를 쓴다.
// 각 함수는 테이블 이름을 받는다 — 마이그레이션이 `<이름>__new` 로 만들어 데이터를 옮긴 뒤 이름을 바꾸기 때문.
// FK 정책: 팀이 지워지면 그 팀의 계정·대진은 같이 지우고(CASCADE), 토너먼트 칸/경기의 팀은 비운다(SET NULL).
// 점수가 걸린 대진·심판은 지울 수 없다(RESTRICT) — 점수가 고아가 되는 것을 막는다.
export const SCHEMA_VERSION = 3;

export const TEAMS_DDL = (n = 'teams') => `
  CREATE TABLE ${n} (
    id      TEXT PRIMARY KEY,
    cat     TEXT NOT NULL CHECK (cat IN ('J','S')),
    code    TEXT NOT NULL,
    name    TEXT NOT NULL UNIQUE,
    region  TEXT,
    org     TEXT,
    coach   TEXT,
    members TEXT NOT NULL CHECK (json_valid(members)), -- JSON 배열(첫 번째가 팀장)
    UNIQUE (id, cat) -- matches 의 (team_id, cat) 복합 FK 대상
  );`;

export const USERS_DDL = (n = 'users') => `
  CREATE TABLE ${n} (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','judge','admin')),
    team_id       TEXT REFERENCES teams(id) ON DELETE CASCADE,
    judge_table   INTEGER, -- 심판 담당 테이블의 단일 출처 (옛 judge_assignments 테이블은 쓰이지 않아 제거)
    salt          TEXT NOT NULL,
    hash          TEXT NOT NULL,
    must_change   INTEGER NOT NULL DEFAULT 0,
    token_version INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL,
    last_login_at INTEGER
  );`;
export const USERS_INDEX = 'CREATE UNIQUE INDEX IF NOT EXISTS users_team_member ON users (team_id, name) WHERE role = \'user\';';

// 이름과 달리 "경기" 가 아니라 팀 한 곳의 (라운드, 조, 테이블, 좌/우) 배정 한 줄이다. id = R{round}-{teamId}.
// cat 은 teams.cat 과 같은 값이어야 한다 — 복합 FK 가 어긋남을 막는다.
export const MATCHES_DDL = (n = 'matches') => `
  CREATE TABLE ${n} (
    id       TEXT PRIMARY KEY,
    round    INTEGER NOT NULL CHECK (round IN (1,2)),
    cat      TEXT NOT NULL CHECK (cat IN ('J','S')),
    wave     TEXT NOT NULL CHECK (wave IN ('A','B')),
    table_no INTEGER NOT NULL,
    field    TEXT NOT NULL CHECK (field IN ('좌','우')),
    team_id  TEXT NOT NULL,
    FOREIGN KEY (team_id, cat) REFERENCES teams (id, cat) ON DELETE CASCADE,
    UNIQUE (id, team_id) -- scores 의 (match_id, team_id) 복합 FK 대상
  );`;

// scores.team_id 는 matches.team_id 와 같은 값이어야 한다 — 복합 FK 가 어긋남을 막는다.
export const SCORES_DDL = (n = 'scores') => `
  CREATE TABLE ${n} (
    match_id     TEXT NOT NULL,
    team_id      TEXT NOT NULL,
    judge_id     TEXT NOT NULL REFERENCES users(id),
    points       REAL NOT NULL,
    ts           INTEGER NOT NULL,
    sheet        TEXT,
    status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','modified','rejected')),
    pen_cnt      INTEGER NOT NULL DEFAULT 0,
    confirmed_at INTEGER,
    confirmed_by TEXT,
    PRIMARY KEY (match_id, team_id, judge_id),
    FOREIGN KEY (match_id, team_id) REFERENCES matches (id, team_id)
  );`;

// 감사 로그는 대상(계정·팀 등)이 지워져도 남아야 해서 일부러 FK 를 두지 않는다.
export const AUDIT_DDL = `
  CREATE TABLE IF NOT EXISTS score_audit (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    ts        INTEGER NOT NULL,
    actor_id  TEXT NOT NULL,
    action    TEXT NOT NULL,
    entity    TEXT NOT NULL,
    entity_id TEXT,
    detail    TEXT
  );
  CREATE INDEX IF NOT EXISTS score_audit_ts ON score_audit (ts DESC);`;

export const SETTINGS_DDL = (n = 'settings') => `
  CREATE TABLE ${n} (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL CHECK (json_valid(value)), -- JSON
    updated_at INTEGER NOT NULL
  );`;

export const T_SLOTS_DDL = (n = 'tournament_slots') => `
  CREATE TABLE ${n} (
    cat     TEXT NOT NULL CHECK (cat IN ('J','S')),
    slot_no INTEGER NOT NULL CHECK (slot_no BETWEEN 1 AND 8),
    team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
    PRIMARY KEY (cat, slot_no)
  );`;

// 확정된 결과(점수·승자). 심판이 낸 미확정 점수는 tournament_submissions 에 따로 둔다.
export const T_GAMES_DDL = (n = 'tournament_games') => `
  CREATE TABLE ${n} (
    cat        TEXT NOT NULL CHECK (cat IN ('J','S')),
    round      TEXT NOT NULL CHECK (round IN ('QF','SF','F','3P')),
    game_no    INTEGER NOT NULL,
    team_a     TEXT REFERENCES teams(id) ON DELETE SET NULL,
    team_b     TEXT REFERENCES teams(id) ON DELETE SET NULL,
    score_a    REAL,
    score_b    REAL,
    winner     TEXT REFERENCES teams(id) ON DELETE SET NULL,
    status     TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','done')),
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (cat, round, game_no)
  );`;

export const T_SUBS_DDL = (n = 'tournament_submissions') => `
  CREATE TABLE ${n} (
    cat      TEXT NOT NULL CHECK (cat IN ('J','S')),
    round    TEXT NOT NULL CHECK (round IN ('QF','SF','F','3P')),
    game_no  INTEGER NOT NULL,
    score_a  REAL NOT NULL,
    score_b  REAL NOT NULL,
    judge_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ts       INTEGER NOT NULL,
    PRIMARY KEY (cat, round, game_no)
  );`;

// 부모 → 자식 순서. 마이그레이션이 이 순서로 옮긴다.
export const MIGRATED_TABLES: { name: string; ddl: (n: string) => string; cols: string }[] = [
  { name: 'teams', ddl: TEAMS_DDL, cols: 'id, cat, code, name, region, org, coach, members' },
  { name: 'users', ddl: USERS_DDL, cols: 'id, name, role, team_id, judge_table, salt, hash, must_change, token_version, created_at, last_login_at' },
  { name: 'matches', ddl: MATCHES_DDL, cols: 'id, round, cat, wave, table_no, field, team_id' },
  { name: 'scores', ddl: SCORES_DDL, cols: 'match_id, team_id, judge_id, points, ts, sheet, status, pen_cnt, confirmed_at, confirmed_by' },
  { name: 'settings', ddl: SETTINGS_DDL, cols: 'key, value, updated_at' },
  { name: 'tournament_slots', ddl: T_SLOTS_DDL, cols: 'cat, slot_no, team_id' },
  { name: 'tournament_games', ddl: T_GAMES_DDL, cols: 'cat, round, game_no, team_a, team_b, score_a, score_b, winner, status, updated_at' },
  { name: 'tournament_submissions', ddl: T_SUBS_DDL, cols: 'cat, round, game_no, score_a, score_b, judge_id, ts' },
];
