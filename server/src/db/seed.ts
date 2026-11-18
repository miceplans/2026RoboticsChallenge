import { db } from './connection.ts';
import { hasSetting, setSetting } from './settings.ts';
import { logAudit } from './audit.ts';
import { DEFAULT_TEAMS } from '../defaults.ts';

// --- 시드 ---

// teams 가 비어 있으면 기본 명단·대진·기본 설정을 채운다 (첫 기동).
export function seedIfEmpty(): void {
  const count = (db.prepare('SELECT COUNT(*) AS c FROM teams').get() as { c: number }).c;
  if (count > 0) return;
  db.exec('BEGIN');
  try {
    const teams = DEFAULT_TEAMS.map((t) => ({ ...t, id: t.code }));
    const insTeam = db.prepare('INSERT INTO teams (id, cat, code, name, region, org, coach, members) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const t of teams) insTeam.run(t.id, t.cat, t.code, t.name, t.region, t.org, t.coach, JSON.stringify(t.members));
    // 기본 배정: 부문마다 명단 순서대로 1조 A, 1조 B, 2조 A … 8조 B (추첨 결과는 관리자 운영 순서 화면에서 다시 배치한다).
    // matches.table_no = 조 번호, wave = A/B 테이블, field 는 A→좌·B→우.
    const insMatch = db.prepare('INSERT INTO matches (id, round, cat, wave, table_no, field, team_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const round of [1, 2] as const) {
      for (const t of teams) {
        const i = teams.filter((x) => x.cat === t.cat).findIndex((x) => x.id === t.id);
        const side = i % 2 ? 'B' : 'A';
        insMatch.run(`R${round}-${t.id}`, round, t.cat, side, Math.floor(i / 2) % 8 + 1, side === 'A' ? '좌' : '우', t.id);
      }
    }
    db.exec('COMMIT');
    console.log(`seeded ${teams.length} teams and ${teams.length * 2} matches`);
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  if (!hasSetting('auto_confirm')) setSetting('auto_confirm', '1');
  if (!hasSetting('board_public')) setSetting('board_public', '1');
  if (!hasSetting('notice')) setSetting('notice', JSON.stringify({ message: '', updatedAt: Date.now() }));
}

// 1회성: 심판 제출 = 확정으로 정책 변경. 기존 DB 의 auto_confirm 을 켜고, 남아 있던 확정 대기(pending) 점수를
// 제출한 심판 이름으로 확정한다 (자동 확정과 같은 형태). 끝나면 표시를 남겨 다시 돌지 않으므로 이후 관리자가 끈 설정은 유지된다.
export function migrateAutoConfirmOn(): void {
  if (hasSetting('migrated_auto_confirm_on')) return;
  const now = Date.now();
  db.exec('BEGIN');
  try {
    const pending = db.prepare("SELECT match_id AS matchId, team_id AS teamId, judge_id AS judgeId FROM scores WHERE status = 'pending'").all() as { matchId: string; teamId: string; judgeId: string }[];
    db.prepare("UPDATE scores SET status = 'confirmed', confirmed_at = ?, confirmed_by = judge_id WHERE status = 'pending'").run(now);
    for (const p of pending) logAudit(p.judgeId, 'confirm', 'score', `${p.matchId}/${p.teamId}`, { judgeId: p.judgeId, migration: 'auto_confirm_on' });
    logAudit('system', 'settings', 'settings', 'auto_confirm', { autoConfirm: true, migration: 'auto_confirm_on', confirmedPending: pending.length });
    setSetting('auto_confirm', '1');
    setSetting('migrated_auto_confirm_on', 'true');
    db.exec('COMMIT');
    console.log(`[migrate] 자동 확정 켬, 확정 대기 점수 ${pending.length}건 확정`);
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
