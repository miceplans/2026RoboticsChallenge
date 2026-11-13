import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { DatabaseSync } from 'node:sqlite';
import { getDb } from './contest-db';

// contest.db users 테이블을 쓰는 계정 레이어.
// 참가자(user, 가입으로 생성)와 심판/관리자(staff, 관리자 발급) 계정이 같은 테이블에 있고 role 로 구분한다.
// scrypt 는 비동기로 돌려 로그인 시도가 몰려도 이벤트 루프를 막지 않게 한다.
export type Role = 'user' | 'judge' | 'admin';
export type RegisteredUser = { id: string; name: string; teamId: string };
export type VerifiedUser = { id: string; name: string; role: Role; teamId?: string; tv: number };

const scrypt = promisify(scryptCb) as (password: string, salt: string, keylen: number) => Promise<Buffer>;

type Statements = {
  find: ReturnType<DatabaseSync['prepare']>;
  credentials: ReturnType<DatabaseSync['prepare']>;
  touchLogin: ReturnType<DatabaseSync['prepare']>;
};
let stmts: Statements | null = null;

function getStatements(): Statements {
  if (!stmts) {
    const db = getDb();
    stmts = {
      find: db.prepare('SELECT id, name, role, team_id AS teamId, token_version AS tv FROM users WHERE id = ?'),
      credentials: db.prepare('SELECT salt, hash FROM users WHERE id = ?'),
      touchLogin: db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?'),
    };
  }
  return stmts;
}

const hashPassword = async (password: string, salt: string) => (await scrypt(password, salt, 32)).toString('base64url');

export function findRegisteredUser(id: string): RegisteredUser | null {
  const row = getStatements().find.get(id) as { id: string; name: string; role: Role; teamId: string | null } | undefined;
  return row && row.role === 'user' ? { id: row.id, name: row.name, teamId: row.teamId ?? '' } : null;
}

export async function verifyRegisteredUser(id: string, password: string): Promise<RegisteredUser | null> {
  const user = await verifyUser(id, password);
  return user && user.role === 'user' && user.teamId ? { id: user.id, name: user.name, teamId: user.teamId } : null;
}

// 참가자·심판·관리자 공통 비밀번호 검증
export async function verifyUser(id: string, password: string): Promise<VerifiedUser | null> {
  const row = getStatements().credentials.get(id) as { salt: string; hash: string } | undefined;
  if (!row) return null;
  const hash = await hashPassword(password, row.salt);
  const a = Buffer.from(hash);
  const b = Buffer.from(row.hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const user = getStatements().find.get(id) as { id: string; name: string; role: Role; teamId: string | null; tv: number } | undefined;
  return user ? { id: user.id, name: user.name, role: user.role, tv: user.tv, ...(user.teamId ? { teamId: user.teamId } : {}) } : null;
}

// 로그인 성공 시 마지막 접속 시각을 남긴다 (관리자의 접속 현황 집계에 쓴다)
export function touchLogin(id: string): void {
  getStatements().touchLogin.run(Date.now(), id);
}

// 세션 토큰과 DB 대조 — 비밀번호 재발급·강등 때 올라간 token_version 과 다른면 세션을 무효화한다.
export function assertSessionFresh(s: { id: string; role: Role; teamId?: string; tv?: number }): boolean {
  const row = getStatements().find.get(s.id) as { role: Role; teamId: string | null; tv: number } | undefined;
  if (!row) return false;
  return row.role === s.role && (row.teamId ?? undefined) === s.teamId && row.tv === (s.tv ?? 0);
}

// 본인 비밀번호 변경. token_version 을 올려 다른 기기의 세션은 끊고, 새 tv 를 돌려줘 현재 세션을 다시 발급하게 한다.
export async function changePassword(id: string, newPassword: string): Promise<number> {
  const salt = randomBytes(16).toString('base64url');
  const db = getDb();
  db.prepare('UPDATE users SET salt = ?, hash = ?, must_change = 0, token_version = token_version + 1 WHERE id = ?').run(salt, await hashPassword(newPassword, salt), id);
  return (getStatements().find.get(id) as { tv: number }).tv;
}
