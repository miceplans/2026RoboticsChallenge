// lib/session.ts — 세션 토큰 서명·검증 (Next 와 브라우저/edge 런타임에서 쓰는 Web Crypto 구현)
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

const SECRET = 'unit-test-secret-value-32chars!!';
process.env.AUTH_SECRET = SECRET;
const { createSessionToken, verifySessionToken } = await import('./session.ts');

before(() => {
  // 모듈은 import 시점에 AUTH_SECRET 을 읽는다 — 파일 최상단에서 먼저 지정했다.
  assert.ok((process.env.AUTH_SECRET ?? '').length >= 32);
});

const baseUser = { id: 'u1', name: '테스트', role: 'user' as const };

test('발급한 토큰은 검증을 통과하고 페이로드를 돌려준다', async () => {
  const token = await createSessionToken(baseUser);
  const session = await verifySessionToken(token);
  assert.ok(session);
  assert.equal(session.id, 'u1');
  assert.equal(session.role, 'user');
  assert.equal(session.v, 2);
  assert.ok(session.exp > Date.now());
});

test('mc(변경 필요) 플래그도 토큰에 실린다', async () => {
  const token = await createSessionToken({ ...baseUser, mc: 1 });
  const session = await verifySessionToken(token);
  assert.equal(session?.mc, 1);
});

test('서명이 틀린 토큰은 거부한다', async () => {
  const token = await createSessionToken(baseUser);
  const [payload, sig] = token.split('.');
  const last = sig!.slice(-1);
  const forged = `${payload}.${sig!.slice(0, -1)}${last === 'A' ? 'B' : 'A'}`;
  assert.equal(await verifySessionToken(forged), null);
});

test('다른 키로 서명한 토큰은 거부한다', async () => {
  const token = await createSessionToken(baseUser);
  const [payload] = token.split('.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('another-secret-key-32chars........'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const otherSig = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload!))).toString('base64url');
  assert.equal(await verifySessionToken(`${payload}.${otherSig}`), null);
});

test('만료·깨진 포맷은 거부한다', async () => {
  assert.equal(await verifySessionToken(undefined), null);
  assert.equal(await verifySessionToken('not-a-token'), null);

  const payload = Buffer.from(JSON.stringify({ ...baseUser, exp: Date.now() - 1000, v: 2 })).toString('base64url');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(process.env.AUTH_SECRET!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))).toString('base64url');
  assert.equal(await verifySessionToken(`${payload}.${sig}`), null);
});
