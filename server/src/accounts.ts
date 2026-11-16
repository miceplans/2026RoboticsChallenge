// 계정 (심판·관리자 발급/재발급, 로그인 검증, 세션 폐기, 기본 계정 시드).
import { randomBytes, scrypt as scryptCb, scryptSync, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { db, listTeams } from './db.ts';

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

// --- 로그인 · 비밀번호 변경 (Next 가 Vercel 등 다른 호스트에 있어도 DB 는 이 서버만 연다) ---

const scryptAsync = promisify(scryptCb) as (password: string, salt: string, keylen: number) => Promise<Buffer>;
export type VerifiedUser = { id: string; name: string; role: 'user' | 'judge' | 'admin'; teamId?: string; tv: number; mustChange: boolean };

// scrypt 는 비동기로 돌려 로그인 시도가 몰려도 이벤트 루프를 막지 않는다.
export async function verifyUser(id: string, password: string): Promise<VerifiedUser | null> {
  const row = db.prepare('SELECT salt, hash FROM users WHERE id = ?').get(id) as { salt: string; hash: string } | undefined;
  if (!row) return null;
  const a = Buffer.from((await scryptAsync(password, row.salt, 32)).toString('base64url'));
  const b = Buffer.from(row.hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const u = db.prepare('SELECT id, name, role, team_id AS teamId, token_version AS tv, must_change AS mustChange FROM users WHERE id = ?').get(id) as
    | { id: string; name: string; role: VerifiedUser['role']; teamId: string | null; tv: number; mustChange: number }
    | undefined;
  return u ? { id: u.id, name: u.name, role: u.role, tv: u.tv, mustChange: u.mustChange === 1, ...(u.teamId ? { teamId: u.teamId } : {}) } : null;
}

export function touchLogin(id: string): void {
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(Date.now(), id);
}

// 본인 비밀번호 변경. token_version 을 올려 다른 기기 세션을 끊고, 새 tv 를 돌려준다.
export async function changeOwnPassword(id: string, newPassword: string): Promise<number> {
  const salt = randomBytes(16).toString('base64url');
  const hash = (await scryptAsync(newPassword, salt, 32)).toString('base64url');
  db.prepare('UPDATE users SET salt = ?, hash = ?, must_change = 0, token_version = token_version + 1 WHERE id = ?').run(salt, hash, id);
  return (db.prepare('SELECT token_version AS tv FROM users WHERE id = ?').get(id) as { tv: number }).tv;
}

// 모든 계정의 세션을 한 번에 폐기 — 관리자가 침해 의심이나 대회 전에 사용.
export function revokeAllSessions(): void {
  db.exec('UPDATE users SET token_version = token_version + 1');
}

// 발급용 임시 비밀번호. base64url 8자 — 종이에 적어 나눠주기 짧고, 해시로 저장되므로 재사용핸도 안전하다.
// 계정 기본 비밀번호. 관리자가 비밀번호를 "초기화"하면 이 값으로 돌아간다.
// 운영에서는 반드시 환경변수 DEFAULT_PASSWORD 로 강한 값을 지정한다 — 없으면 기동을 멈춘다.
// 개발에서 생략하면 부팅 때마다 임의 값을 만들어 서버 로그에 한 번만 남긴다. 코드·저장소·환경 예시에 공통 기본값을 두지 않는다.
function initDefaultPassword(): string {
  if (process.env.DEFAULT_PASSWORD) return process.env.DEFAULT_PASSWORD;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('운영 환경에서는 DEFAULT_PASSWORD 를 반드시 설정해야 합니다 (계정 비밀번호 초기화용 공통 값).');
  }
  const generated = randomBytes(9).toString('base64url');
  console.log(`[dev] DEFAULT_PASSWORD 가 없어 임의 값 '${generated}' 를 씁니다. 고정하려면 server/.env 에 DEFAULT_PASSWORD 를 지정하세요.`);
  return generated;
}
export const DEFAULT_PASSWORD = initDefaultPassword();
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
        // 기본 비밀번호로 만든 계정은 첫 로그인 후 반드시 바꾸게 한다 (must_change=1, 프록시·서버가 강제)
        insertAccount({ ...a, password: DEFAULT_PASSWORD });
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
    // 비밀번호를 바꾸면 기존 세션은 즉시 무효 (token_version 증가). 초기화된 비밀번호는 기본값이므로 다시 로그인하면 바꾸도록 must_change=1.
    const upd = db.prepare('UPDATE users SET salt = ?, hash = ?, must_change = 1, token_version = token_version + 1 WHERE id = ?');
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

// 심판의 담당 테이블. REF01~REF08 는 ID 에서 고정, 그 외는 발급/배정된 judge_table.
const REF_TABLE = /^REF0?([1-8])$/i;
export function judgeTableOf(judgeId: string): number | null {
  const fromId = REF_TABLE.exec(judgeId)?.[1];
  if (fromId) return Number(fromId);
  return getJudgeTables()[judgeId] ?? null;
}

