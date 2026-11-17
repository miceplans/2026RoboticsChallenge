import { db } from './connection.ts';

// --- 팀 · 대진 ---

export type Team = {
  id: string;
  cat: 'J' | 'S';
  code: string;
  name: string;
  region: string;
  org: string;
  coach: string;
  members: string[]; // 첫 번째가 팀장
};
export type Match = {
  id: string;
  round: 1 | 2;
  cat: 'J' | 'S';
  wave: 'A' | 'B';
  table: number;
  field: '좌' | '우';
  team: string;
};

const listTeamsStmt = db.prepare('SELECT id, cat, code, name, region, org, coach, members FROM teams ORDER BY id');
export function listTeams(): Team[] {
  return (listTeamsStmt.all() as (Omit<Team, 'members'> & { members: string })[]).map((t) => ({ ...t, members: JSON.parse(t.members) as string[] }));
}

// 전체 교체 (관리자 명단 Import). 점수가 있으면 엔드포인트에서 이미 막는다.
// 팀 ID 를 참조하는 대진·토너먼트 데이터는 함께 비운다. 같은 ID 의 팀은 지우지 않고 갱신해서 그 팀의 계정(users)이 유지되고,
// 명단에서 빠진 팀만 삭제한다 (FK CASCADE 로 그 팀의 계정·대진이 같이 지워진다).
export function replaceTeams(teams: Team[]): void {
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM tournament_games').run();
    db.prepare('DELETE FROM tournament_submissions').run();
    db.prepare('DELETE FROM tournament_slots').run();
    db.prepare('DELETE FROM matches').run();
    const keep = new Set(teams.map((t) => t.id));
    for (const { id } of db.prepare('SELECT id FROM teams').all() as { id: string }[]) {
      if (!keep.has(id)) db.prepare('DELETE FROM teams WHERE id = ?').run(id);
    }
    // 이름 UNIQUE 가 서로 바꿔치기(A↔B)에서 충돌하지 않도록 기존 팀 이름을 먼저 비켜 둔다
    db.prepare("UPDATE teams SET name = '~' || id").run();
    const up = db.prepare(`INSERT INTO teams (id, cat, code, name, region, org, coach, members) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET cat = excluded.cat, code = excluded.code, name = excluded.name, region = excluded.region, org = excluded.org, coach = excluded.coach, members = excluded.members`);
    for (const t of teams) up.run(t.id, t.cat, t.code, t.name, t.region ?? null, t.org ?? null, t.coach ?? null, JSON.stringify(t.members));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

const listMatchesStmt = db.prepare('SELECT id, round, cat, wave, table_no AS "table", field, team_id AS team FROM matches ORDER BY id');
export const listMatches = () => listMatchesStmt.all() as Match[];

// 제출 검증용: 경기가 실제 대진에 있는지, 그리고 그 경기의 팀이 맞는지 본다.
export function getMatch(id: string): Match | null {
  return (db.prepare('SELECT id, round, cat, wave, table_no AS "table", field, team_id AS team FROM matches WHERE id = ?').get(id) as Match | undefined) ?? null;
}

// 대진 전체 교체. 점수가 걸린 대진은 지우거나 팀·부문을 바꿀 수 없다 (scores FK) — 그런 변경이면 'matches_in_use' 로 거절한다.
export function replaceMatches(matches: Match[]): void {
  // 한 칸(라운드·부문·조·A/B)에는 한 팀만 — 겹치면 저장하지 않는다
  const seen = new Set<string>();
  for (const m of matches) {
    const k = `${m.round}|${m.cat}|${m.table}|${m.wave}`;
    if (seen.has(k)) throw new Error(`slot_taken:${m.cat}-${m.round}R-${m.table}조-${m.wave}`);
    seen.add(k);
  }
  db.exec('BEGIN');
  try {
    const teamExists = db.prepare('SELECT COUNT(*) AS c FROM teams WHERE id = ?');
    for (const m of matches) {
      if ((teamExists.get(m.team) as { c: number }).c === 0) throw new Error(`unknown_team:${m.team}`);
    }
    const keep = new Set(matches.map((m) => m.id));
    for (const { id } of db.prepare('SELECT id FROM matches').all() as { id: string }[]) {
      if (!keep.has(id)) db.prepare('DELETE FROM matches WHERE id = ?').run(id);
    }
    const up = db.prepare(`INSERT INTO matches (id, round, cat, wave, table_no, field, team_id) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET round = excluded.round, cat = excluded.cat, wave = excluded.wave, table_no = excluded.table_no, field = excluded.field, team_id = excluded.team_id`);
    for (const m of matches) up.run(m.id, m.round, m.cat, m.wave, m.table, m.field, m.team);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    if (/FOREIGN KEY/i.test((e as Error).message)) throw new Error('matches_in_use');
    throw e;
  }
}

// 예전 배정 방식(테이블 1~8 × 웨이브 A/B × 좌/우)으로 저장된 대진은 한 칸(조·A/B)에 여러 팀이 겹친다.
// 겹침이 있는 라운드·부문만 예전 순서(테이블 → 웨이브 → 좌/우) 그대로 1조 A, 1조 B, 2조 A … 로 다시 앉힌다.
// 경기 ID 는 바꾸지 않으므로 이미 들어온 점수는 그대로 이어진다. 기동할 때마다 불러도 겹침이 없으면 아무것도 하지 않는다.
export function normalizeMatchSlots(): number {
  const rows = db.prepare('SELECT id, round, cat, wave, table_no AS "table", field FROM matches').all() as Omit<Match, 'team'>[];
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = `${r.round}|${r.cat}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  const upd = db.prepare('UPDATE matches SET table_no = ?, wave = ?, field = ? WHERE id = ?');
  let fixed = 0;
  db.exec('BEGIN');
  try {
    for (const list of groups.values()) {
      const slots = new Set(list.map((r) => `${r.table}|${r.wave}`));
      if (slots.size === list.length && list.every((r) => r.table >= 1 && r.table <= 8)) continue;
      list.sort((a, b) => a.table - b.table || a.wave.localeCompare(b.wave) || (a.field === b.field ? 0 : a.field === '좌' ? -1 : 1) || a.id.localeCompare(b.id));
      list.forEach((r, i) => {
        const side = i % 2 ? 'B' : 'A';
        upd.run(Math.floor(i / 2) % 8 + 1, side, side === 'A' ? '좌' : '우', r.id);
      });
      fixed++;
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  if (fixed) console.log(`[migrate] 예전 테이블 배정을 조·A/B 배정으로 정리 (${fixed}개 라운드·부문)`);
  return fixed;
}
