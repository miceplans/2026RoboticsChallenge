import { db } from './connection.ts';
import type { ScoreStatus } from './scores.ts';

// 대시보드 집계: 경기 진행, 확정 대기, 심판별 제출, 접속 현황
export type Overview = {
  matches: { total: number; done: number };
  pendingCount: number;
  judges: { id: string; name: string; submitted: number }[];
  users: { total: number; active24h: number; neverLoggedIn: number };
  scores: { total: number; pending: number; confirmed: number; modified: number; rejected: number };
};
export function getOverview(): Overview {
  const matchTotal = (db.prepare('SELECT COUNT(*) AS c FROM matches').get() as { c: number }).c;
  const matchDone = (db.prepare("SELECT COUNT(DISTINCT match_id) AS c FROM scores WHERE status != 'rejected'").get() as { c: number }).c;
  const pendingCount = (db.prepare("SELECT COUNT(*) AS c FROM scores WHERE status = 'pending'").get() as { c: number }).c;
  // 심판에게 조 배정은 없으므로 심판별 '담당 경기 수' 는 없고, 제출한 경기 수만 센다.
  const judges = (db.prepare('SELECT id, name FROM users WHERE role = \'judge\' ORDER BY id').all() as { id: string; name: string }[]).map((j) => {
    const submitted = (db.prepare("SELECT COUNT(DISTINCT match_id) AS c FROM scores WHERE judge_id = ? AND status != 'rejected'").get(j.id) as { c: number }).c;
    return { ...j, submitted };
  });
  const userTotal = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
  const active24h = (db.prepare('SELECT COUNT(*) AS c FROM users WHERE last_login_at > ?').get(Date.now() - 24 * 3600_000) as { c: number }).c;
  const neverLoggedIn = (db.prepare('SELECT COUNT(*) AS c FROM users WHERE last_login_at IS NULL').get() as { c: number }).c;
  const scoreRows = db.prepare('SELECT status, COUNT(*) AS c FROM scores GROUP BY status').all() as { status: ScoreStatus; c: number }[];
  const byStatus = Object.fromEntries(scoreRows.map((r) => [r.status, r.c]));
  return {
    matches: { total: matchTotal, done: matchDone },
    pendingCount,
    judges,
    users: { total: userTotal, active24h, neverLoggedIn },
    scores: {
      total: scoreRows.reduce((s, r) => s + r.c, 0),
      pending: byStatus.pending ?? 0,
      confirmed: byStatus.confirmed ?? 0,
      modified: byStatus.modified ?? 0,
      rejected: byStatus.rejected ?? 0,
    },
  };
}
