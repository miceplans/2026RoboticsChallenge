// server/src/schema.ts 의 USERS_DDL/TEAMS_DDL 을 lib/contest-db.ts 로 복사한다.
// 단일 출처는 server/src/schema.ts — 이 스크립트로 동기화해 두 카피가 어긋나지 않게 한다.
// 사용: node scripts/sync-schema.mjs  (schema.ts 바꾼 뒤 실행)
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = new URL('../server/src/schema.ts', import.meta.url);
const DST = new URL('../lib/contest-db.ts', import.meta.url);

const src = readFileSync(SRC, 'utf8');
const grab = (name) => {
  const m = new RegExp('export const ' + name + ' = `([\\s\\S]*?)`;').exec(src);
  if (!m) throw new Error(`${name} not found in schema.ts`);
  return m[1].trim();
};

const dst = readFileSync(DST, 'utf8');
const next = dst.replace(
  /\/\/ <sync-schema:start>[\s\S]*?\/\/ <sync-schema:end>/,
  `// <sync-schema:start> (server/src/schema.ts 에서 자동 복사 — 직접 고치지 말 것)
const USERS_DDL = \`
${grab('USERS_DDL')}
\`;
const TEAMS_DDL = \`
${grab('TEAMS_DDL')}
\`;
// <sync-schema:end>`,
);
if (next === dst) throw new Error('sync markers not found in lib/contest-db.ts');
writeFileSync(DST, next);
console.log('synced users/teams DDL from server/src/schema.ts to lib/contest-db.ts');
