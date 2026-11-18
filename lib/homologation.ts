// 로봇 승인서 (Robotics for Good Youth Challenge 2026–2027 Homologation Sheet, 한국어판).
// 항목·판정 규칙은 server/src/db/homologation.ts 와 같다 — 한쪽을 바꾸면 다른 쪽도 맞춘다.

export const MAX_ROBOTS = 20;

export const STATIC_CHECKS = ['label', 'startZone', 'startMethod', 'autonomous', 'safety', 'estop'] as const;
export const DYNAMIC_CHECKS = ['dynStart', 'dynSafe'] as const;
export const ROBOT_CHECKS = [...STATIC_CHECKS, ...DYNAMIC_CHECKS] as const;
export type RobotCheck = (typeof ROBOT_CHECKS)[number];

export type HomologationStatus = 'pass' | 'fail';
export type HomologationData = {
  robots: number;
  judge: string;
  decoration: 'yes' | 'no' | null;
  checks: Record<RobotCheck, boolean[]>;
  judgeSig?: string | null;
  teamSig?: string | null;
};
export type Homologation = HomologationData & { teamId: string; status: HomologationStatus; updatedAt: number; updatedBy: string };

export const robotLabel = (i: number) => `R${i + 1}`;

// 양식 문구의 "R1, R2, R3 또는 R4" 를 로봇 수에 맞춘다 (5대 이상은 "R1~R12")
export function robotList(n: number) {
  if (n <= 1) return 'R1';
  if (n <= 4) return `${Array.from({ length: n - 1 }, (_, i) => robotLabel(i)).join(', ')} 또는 ${robotLabel(n - 1)}`;
  return `R1~R${n}`;
}
export const robotRange = (n: number) => (n <= 1 ? 'R1' : `R1~R${n}`);

export function emptyHomologation(robots = 4): HomologationData {
  const checks = {} as Record<RobotCheck, boolean[]>;
  for (const k of ROBOT_CHECKS) checks[k] = Array(robots).fill(false);
  return { robots, judge: '', decoration: null, checks, judgeSig: null, teamSig: null };
}

export function resizeRobots(d: HomologationData, robots: number): HomologationData {
  const checks = {} as Record<RobotCheck, boolean[]>;
  for (const k of ROBOT_CHECKS) checks[k] = Array.from({ length: robots }, (_, i) => d.checks[k]?.[i] === true);
  return { ...d, robots, checks };
}

export const staticPassed = (d: HomologationData, i: number) => d.decoration === 'yes' && STATIC_CHECKS.every((k) => d.checks[k][i] === true);
export const robotApproved = (d: HomologationData, i: number) => staticPassed(d, i) && DYNAMIC_CHECKS.every((k) => d.checks[k][i] === true);
export const robotIndexes = (d: HomologationData) => Array.from({ length: d.robots }, (_, i) => i);
export const homologationStatus = (d: HomologationData): HomologationStatus => (robotIndexes(d).some((i) => robotApproved(d, i)) ? 'pass' : 'fail');

// 화면 표 머리에 쓰는 짧은 이름
export const SHORT_LABEL: Record<RobotCheck, string> = {
  label: '로봇 라벨링',
  startZone: '로봇과 시작 구역',
  startMethod: '명확한 시작 방식',
  autonomous: '자율 작동 신고',
  safety: '안전성·완성도',
  estop: '비상 정지',
  dynStart: '시작 및 시작 구역 이탈',
  dynSafe: '안전하고 통제된 움직임',
};

export const CATEGORY_LABEL = { J: '주니어', S: '시니어' } as const;
