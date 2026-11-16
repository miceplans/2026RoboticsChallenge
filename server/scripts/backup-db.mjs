// 운영 DB 백업 — VACUUM INTO 로 온라인 일관 스냅샷을 만든다 (서버를 멈출 필요 없음, WAL 지원).
//
// EC2 cron 예 (6시간마다, 최근 28개 보관):
//   0 */6 * * * DB_PATH=/data/contest.db BACKUP_DIR=/data/backups KEEP=28 /usr/bin/node /opt/app/scripts/backup-db.mjs >> /var/log/contest-backup.log 2>&1
//
// 복원은 서버를 멈추고 백업 파일을 DB_PATH 로 옮긴 뒤 재시작한다 (docs/operations.md 참고).

import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const SRC = process.env.DB_PATH ?? '/data/contest.db';
const DIR = process.env.BACKUP_DIR ?? '/data/backups';
const KEEP = Number(process.env.KEEP ?? 28);

if (!existsSync(SRC)) {
  console.error(`백업 대상이 없습니다: ${SRC}`);
  process.exit(1);
}
mkdirSync(DIR, { recursive: true });

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const dest = join(DIR, `contest-${stamp}.db`);

const db = new DatabaseSync(SRC);
try {
  db.exec(`VACUUM INTO '${dest}'`);
} finally {
  db.close();
}

// 백업이 손상되지 않았는지 확인한 뒤 오래된 것부터 지운다.
const check = new DatabaseSync(dest, { readOnly: true });
try {
  const row = check.prepare('PRAGMA integrity_check').get();
  if (row.integrity_check !== 'ok') throw new Error(`integrity_check 실패: ${row.integrity_check}`);
  const { c } = check.prepare('SELECT COUNT(*) AS c FROM teams').get();
  console.log(`${dest} (teams=${c})`);
} finally {
  check.close();
}

const backups = readdirSync(DIR).filter((f) => f.startsWith('contest-') && f.endsWith('.db')).sort();
for (const old of backups.slice(0, Math.max(0, backups.length - KEEP))) {
  unlinkSync(join(DIR, old));
  console.log(` rotated out ${old}`);
}
