import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// 회원가입으로 생성한 참가자 계정. 심판/관리자 데모 계정(lib/auth.ts)과 별개다.
// 본선 명단(TEAMS)의 팀 이름+참가자 이름과 일치해야만 가입할 수 있고, 가입 시 팀에 연결된다.
export type RegisteredUser = { id: string; name: string; teamId: string };

// 빌드/프리렌더 때는 DB 를 열지 않는다 (실행 시점에만 연다)
type Statements = {
  find: ReturnType<DatabaseSync['prepare']>;
  findMember: ReturnType<DatabaseSync['prepare']>;
  credentials: ReturnType<DatabaseSync['prepare']>;
  insert: ReturnType<DatabaseSync['prepare']>;
};
let stmts: Statements | null = null;

function getStatements(): Statements {
  if (!stmts) {
    const db = new DatabaseSync(process.env.USERS_DB_PATH ?? 'users.db');
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA busy_timeout = 5000');
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        team_id    TEXT NOT NULL,
        salt       TEXT NOT NULL,
        hash       TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS users_team_member ON users (team_id, name);
    `);
    stmts = {
      find: db.prepare('SELECT id, name, team_id AS teamId FROM users WHERE id = ?'),
      findMember: db.prepare('SELECT id, name, team_id AS teamId FROM users WHERE team_id = ? AND name = ?'),
      credentials: db.prepare('SELECT salt, hash FROM users WHERE id = ?'),
      insert: db.prepare('INSERT INTO users (id, name, team_id, salt, hash, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
    };
  }
  return stmts;
}

const hashPassword = (password: string, salt: string) => scryptSync(password, salt, 32).toString('base64url');

export function findRegisteredUser(id: string): RegisteredUser | null {
  return (getStatements().find.get(id) as RegisteredUser | undefined) ?? null;
}

// 같은 팀의 같은 참가자가 이미 가입했는지 확인한다 (계정 중복 방지)
export function findTeamMemberUser(teamId: string, name: string): RegisteredUser | null {
  return (getStatements().findMember.get(teamId, name) as RegisteredUser | undefined) ?? null;
}

export function verifyRegisteredUser(id: string, password: string): RegisteredUser | null {
  const row = getStatements().credentials.get(id) as { salt: string; hash: string } | undefined;
  if (!row) return null;
  const hash = hashPassword(password, row.salt);
  const a = Buffer.from(hash);
  const b = Buffer.from(row.hash);
  return a.length === b.length && timingSafeEqual(a, b) ? findRegisteredUser(id) : null;
}

// UNIQUE(팀, 참가자) 제약 때문에 같은 팀원이 두 계정을 만들 수 없다. 아이디 중복도 여기서 걸러진다.
export function registerUser(user: RegisteredUser & { password: string }): void {
  const salt = randomBytes(16).toString('base64url');
  getStatements().insert.run(user.id, user.name, user.teamId, salt, hashPassword(user.password, salt), Date.now());
}
