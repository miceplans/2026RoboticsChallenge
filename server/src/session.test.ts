import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'contest-session-test-'));
process.env.DB_PATH = join(dir, 'test.db');
const db = await import('./db.ts');
const { sessionFromCookie } = await import('./session.ts');

before(() => {
  db.seedIfEmpty();
  db.seedDefaultMatches();
  db.issueAccounts([{ id: 'jdg1', name: '테스트 심판', role: 'judge' }]);
});

// 개발용 기본 키로 서명 (테스트는 NODE_ENV 미설정 → lib/session.ts 와 같은 DEV_SECRET)
const DEV_SECRET = 'dev-only-secret-change-me';
const sign = (payload: string) => createHmac('sha256', DEV_SECRET).update(payload).digest('base64url');
const tokenOf = (fields: Record<string, unknown>) => {
  const payload = Buffer.from(JSON.stringify({ v: 2, exp: Date.now() + 3600_000, ...fields })).toString('base64url');
  return `session=${payload}.${sign(payload)}`;
};

test('유효한 서명·만료·DB 대조를 통과하면 세션을 돌려준다', () => {
  const session = sessionFromCookie(tokenOf({ id: 'jdg1', name: '테스트 심판', role: 'judge', tv: 0 }));
  assert.ok(session);
  assert.equal(session.id, 'jdg1');
  assert.equal(session.role, 'judge');
});

test('서명이 틀리면 거부한다 (한 글자만 바꿔도)', () => {
  const cookie = tokenOf({ id: 'jdg1', name: '테스트 심판', role: 'judge', tv: 0 });
  const tampered = cookie.slice(0, -1) + (cookie.endsWith('A') ? 'B' : 'A');
  assert.equal(sessionFromCookie(tampered), null);
});

test('만료된 토큰은 거부한다', () => {
  const payload = Buffer.from(JSON.stringify({ id: 'jdg1', name: '테스트 심판', role: 'judge', tv: 0, exp: Date.now() - 1000, v: 2 })).toString('base64url');
  assert.equal(sessionFromCookie(`session=${payload}.${sign(payload)}`), null);
});

test('DB 와 다른 role·tv 면 거부한다 (비밀번호 재발급·강등으로 폐기된 세션)', () => {
  assert.equal(sessionFromCookie(tokenOf({ id: 'jdg1', name: '테스트 심판', role: 'admin', tv: 0 })), null);
  assert.equal(sessionFromCookie(tokenOf({ id: 'jdg1', name: '테스트 심판', role: 'judge', tv: 99 })), null);
});
