import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areaRoles } from './hosts.ts';

test('심판 영역은 심판만 접근할 수 있다', () => {
  assert.deepEqual(areaRoles.judge, ['judge']);
  assert.equal(areaRoles.judge.includes('admin'), false);
});
