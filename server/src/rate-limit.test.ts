import { test } from 'node:test';
import assert from 'node:assert/strict';
import { throttle, recordAttempt, recordFail } from './rate-limit.ts';

const WINDOW = 10 * 60_000;
const BLOCK = 10 * 60_000;

test('한도 이전까지는 허용하고, 실패 임계치에 도달하면 차단한다', () => {
  const key = `t1:${Math.random()}`;
  for (let i = 0; i < 5; i++) {
    const gate = throttle(key, 5, WINDOW, BLOCK);
    assert.equal(gate.ok, true);
    recordAttempt(key, WINDOW);
    recordFail(key);
  }
  const blocked = throttle(key, 5, WINDOW, BLOCK);
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.ok(blocked.retryAfterSec > 0);
});

test('차단은 해당 키에만 적용된다 (다른 키는 영향 없음)', () => {
  const a = `t2a:${Math.random()}`;
  const b = `t2b:${Math.random()}`;
  for (let i = 0; i < 6; i++) {
    throttle(a, 5, WINDOW, BLOCK);
    recordFail(a);
  }
  assert.equal(throttle(a, 5, WINDOW, BLOCK).ok, false);
  assert.equal(throttle(b, 5, WINDOW, BLOCK).ok, true);
});

test('실패 기록 없이 시도만 있으면 차단하지 않는다', () => {
  const key = `t3:${Math.random()}`;
  for (let i = 0; i < 50; i++) {
    const gate = throttle(key, 5, WINDOW, BLOCK);
    assert.equal(gate.ok, true);
    recordAttempt(key, WINDOW);
  }
});
