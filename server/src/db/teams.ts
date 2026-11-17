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
