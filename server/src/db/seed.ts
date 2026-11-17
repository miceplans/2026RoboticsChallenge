import { db } from './connection.ts';
import { hasSetting, setSetting } from './settings.ts';
import { DEFAULT_TEAMS } from '../defaults.ts';

// --- 시드 ---

// teams 가 비어 있으면 기본 명단·대진·기본 설정을 채운다 (첫 기동).
export function seedIfEmpty(): void {
  const count = (db.prepare('SELECT COUNT(*) AS c FROM teams').get() as { c: number }).c;
  if (count > 0) return;
  db.exec('BEGIN');
  try {
    const insTeam = db.prepare('INSERT INTO teams (id, cat, code, name, region, org, coach, members) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const t of DEFAULT_TEAMS) insTeam.run(t.id, t.cat, t.code, t.name, t.region, t.org, t.coach, JSON.stringify(t.members));
    // 기본 배정 규칙은 lib/judge/data.ts 와 동일: 시니어 1~4, 주니어 5~8, 2차에 조 교환
    const insMatch = db.prepare('INSERT INTO matches (id, round, cat, wave, table_no, field, team_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const round of [1, 2] as const) {
      for (const t of DEFAULT_TEAMS) {
        const i = Number(t.id.slice(1)) - 1;
        const first = i < 8 ? 'A' : 'B';
        const k = i % 8;
        insMatch.run(`R${round}-${t.id}`, round, t.cat, round === 1 ? first : first === 'A' ? 'B' : 'A', (t.cat === 'S' ? 1 : 5) + Math.floor(k / 2), k % 2 ? '우' : '좌', t.id);
      }
    }
    db.exec('COMMIT');
    console.log(`seeded ${DEFAULT_TEAMS.length} teams and ${DEFAULT_TEAMS.length * 2} matches`);
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  if (!hasSetting('auto_confirm')) setSetting('auto_confirm', '0');
  if (!hasSetting('board_public')) setSetting('board_public', '1');
  if (!hasSetting('notice')) setSetting('notice', JSON.stringify({ message: '', updatedAt: Date.now() }));
}
