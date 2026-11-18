import { db } from './connection.ts';

// --- 로봇 승인서 (Homologation Sheet) ---
// 웹의 lib/homologation.ts 와 같은 항목·판정 규칙을 쓴다 — 한쪽을 바꾸면 다른 쪽도 맞춘다.

export const MAX_ROBOTS = 20;

// 로봇별 체크 항목. A) 사전 식별 → B) 정적 검사 → C) 동적 검사 순서.
export const STATIC_CHECKS = ['label', 'startZone', 'startMethod', 'autonomous', 'safety', 'estop'] as const;
export const DYNAMIC_CHECKS = ['dynStart', 'dynSafe'] as const;
export const ROBOT_CHECKS = [...STATIC_CHECKS, ...DYNAMIC_CHECKS] as const;
export type RobotCheck = (typeof ROBOT_CHECKS)[number];

export type HomologationData = {
  robots: number; // 제출 로봇 수 (1~20)
  judge: string; // 심판 / 심사위원 (직접 입력)
  decoration: 'yes' | 'no' | null; // 로봇 장식 — 양식대로 팀 전체 예/아니오
  checks: Record<RobotCheck, boolean[]>; // 항목별 R1~Rn 체크
  judgeSig?: string | null; // 서명 이미지 (data URL)
  teamSig?: string | null;
};
export type HomologationStatus = 'pass' | 'fail';
export type Homologation = HomologationData & { teamId: string; status: HomologationStatus; updatedAt: number; updatedBy: string };

// 정적 검사(사전 식별 포함)를 모두 통과했는지. 장식이 '예'가 아니면 모든 로봇이 탈락이다.
export const staticPassed = (d: HomologationData, i: number) => d.decoration === 'yes' && STATIC_CHECKS.every((k) => d.checks[k][i] === true);
// 출전 승인 = 정적 + 동적 검사를 모두 통과
export const robotApproved = (d: HomologationData, i: number) => staticPassed(d, i) && DYNAMIC_CHECKS.every((k) => d.checks[k][i] === true);
// 팀 승인 기준: 승인된 로봇이 1대 이상이면 출전 가능
export const homologationStatus = (d: HomologationData): HomologationStatus =>
  Array.from({ length: d.robots }, (_, i) => robotApproved(d, i)).some(Boolean) ? 'pass' : 'fail';

// 로봇 수에 맞춰 체크 배열 길이를 맞춘다 (로봇 수를 줄이면 뒤쪽 체크는 버린다)
export function normalizeHomologation(d: HomologationData): HomologationData {
  const checks = {} as Record<RobotCheck, boolean[]>;
  for (const k of ROBOT_CHECKS) checks[k] = Array.from({ length: d.robots }, (_, i) => d.checks[k]?.[i] === true);
  return { robots: d.robots, judge: d.judge.trim(), decoration: d.decoration, checks, judgeSig: d.judgeSig ?? null, teamSig: d.teamSig ?? null };
}

type Row = { team_id: string; data: string; status: HomologationStatus; updated_at: number; updated_by: string };
const toHomologation = (r: Row): Homologation => ({
  ...(JSON.parse(r.data) as HomologationData),
  teamId: r.team_id,
  status: r.status,
  updatedAt: r.updated_at,
  updatedBy: r.updated_by,
});

// 목록에는 서명 이미지를 빼서 가볍게 보낸다 (한 장씩 열 때 getHomologation 으로 받는다)
export function listHomologations(): Homologation[] {
  return (db.prepare('SELECT team_id, data, status, updated_at, updated_by FROM homologations').all() as Row[]).map((r) => {
    const h = toHomologation(r);
    return { ...h, judgeSig: h.judgeSig ? '' : null, teamSig: h.teamSig ? '' : null };
  });
}

export function getHomologation(teamId: string): Homologation | null {
  const r = db.prepare('SELECT team_id, data, status, updated_at, updated_by FROM homologations WHERE team_id = ?').get(teamId) as Row | undefined;
  return r ? toHomologation(r) : null;
}

// 팀 ID → 승인 여부. /config 가 역할별로 걸러 내보낸다 (팀 이름 옆 체크·X 표시용).
export function homologationStatuses(): Record<string, HomologationStatus> {
  const out: Record<string, HomologationStatus> = {};
  for (const r of db.prepare('SELECT team_id, status FROM homologations').all() as { team_id: string; status: HomologationStatus }[]) out[r.team_id] = r.status;
  return out;
}

export function saveHomologation(teamId: string, data: HomologationData, actorId: string): Homologation {
  const clean = normalizeHomologation(data);
  const status = homologationStatus(clean);
  const now = Date.now();
  db.prepare(`INSERT INTO homologations (team_id, data, status, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(team_id) DO UPDATE SET data = excluded.data, status = excluded.status, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .run(teamId, JSON.stringify(clean), status, now, actorId);
  return { ...clean, teamId, status, updatedAt: now, updatedBy: actorId };
}

export function deleteHomologation(teamId: string): boolean {
  return db.prepare('DELETE FROM homologations WHERE team_id = ?').run(teamId).changes > 0;
}
