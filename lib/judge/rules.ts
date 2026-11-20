// 2026 로보틱스 챌린지 문제해결 트랙 채점 규칙 (ITU 룰북 2026-27 기준)
export type Category = 'J' | 'S';
export type Mission = 'M1' | 'M2' | 'PEN';
export type Item = {
  id: string;
  m: Mission;
  label: string;
  // count: 개수 입력 / bool: 여부 / auto: 다른 입력값으로 자동 계산 / manual: 심판이 점수를 직접 입력
  type: 'count' | 'bool' | 'auto' | 'manual';
  max?: number;
  pj: number; // 주니어 배점
  ps: number; // 시니어 배점
};
export type Values = Record<string, number | boolean | string>;

export const CATEGORY_NAMES: Record<Category, string> = { J: '주니어', S: '시니어' };

export const MISSION_NAMES: Record<Mission, string> = {
  M1: '미션 1 — 검체 격리 및 관리',
  M2: '미션 2 — 의료 관리',
  PEN: '일반 벌점',
};

// 공식 점수표(Robotics for Good Youth Challenge 2026–2027 Score sheet V4)의 행과 1:1로 대응한다.
// 실격(DQ) 두 항목은 점수가 아니라 values.dq_danger / values.dq_breach 로 따로 기록한다.
export const ITEMS: Item[] = [
  { id: 's_slot', m: 'M1', label: '실험실 슬롯 안에 있는 검체', type: 'count', max: 3, pj: 15, ps: 15 },
  { id: 'b_samples', m: 'M1', label: '보너스: 실험실 안 검체 3개', type: 'auto', pj: 5, ps: 5 },
  { id: 's_out', m: 'M1', label: '격리구역·실험실 밖에 있는 검체', type: 'count', max: 3, pj: 0, ps: -3 },
  { id: 's_quar', m: 'M1', label: '격리구역에 있는 검체', type: 'count', max: 3, pj: 0, ps: -5 },
  { id: 'beam', m: 'M1', label: '올바른 위치에 똑바로, 안정적으로 서 있는 빔', type: 'count', max: 2, pj: 25, ps: 25 },
  { id: 'closed', m: 'M1', label: '보너스: 격리 경계 완성', type: 'bool', pj: 20, ps: 20 },
  { id: 'kit', m: 'M2', label: 'H 또는 PCC 안의 의료키트', type: 'count', max: 10, pj: 3, ps: 3 },
  { id: 'b_kits', m: 'M2', label: '보너스: 6 H + 2 PCC + 2 PCC 배분', type: 'bool', pj: 20, ps: 20 },
  { id: 'p_kitzone', m: 'M2', label: '키트가 하나도 없는 H/PCC 구역', type: 'count', max: 3, pj: 0, ps: -10 },
  { id: 'red_h', m: 'M2', label: 'H 안의 빨강 실린더', type: 'count', max: 4, pj: 5, ps: 5 },
  { id: 'b_red', m: 'M2', label: '보너스: H 안의 빨강 실린더 4개', type: 'auto', pj: 6, ps: 6 },
  { id: 'yel', m: 'M2', label: 'PCC 안의 노랑 실린더', type: 'count', max: 4, pj: 5, ps: 5 },
  { id: 'b_yel', m: 'M2', label: '보너스: 노랑 2 + 2 분배', type: 'bool', pj: 8, ps: 8 },
  { id: 'grn', m: 'M2', label: 'RZ 구역 안의 초록 실린더', type: 'count', max: 4, pj: 5, ps: 5 },
  { id: 'b_grn', m: 'M2', label: '보너스: RZ 안의 초록 4개', type: 'auto', pj: 6, ps: 6 },
  { id: 'red_out', m: 'M2', label: 'H 밖의 빨강 실린더', type: 'count', max: 4, pj: 0, ps: -3 },
  { id: 'yel_out', m: 'M2', label: 'PCC 밖의 노랑 실린더', type: 'count', max: 4, pj: 0, ps: -3 },
  { id: 'grn_out', m: 'M2', label: 'RZ 밖의 초록 실린더', type: 'count', max: 4, pj: 0, ps: -3 },
  { id: 'pen_touch', m: 'PEN', label: '라운드 중 로봇 접촉', type: 'count', max: 9, pj: -20, ps: -20 },
  { id: 'pen_field', m: 'PEN', label: '경기장 또는 게임 요소 조작', type: 'count', max: 9, pj: -20, ps: -20 },
  { id: 'pen_restart', m: 'PEN', label: '프로그램 재시작 또는 수정', type: 'count', max: 9, pj: -20, ps: -20 },
  { id: 'pen_out', m: 'PEN', label: '로봇이 경기장 밖으로 완전히 이탈', type: 'count', max: 9, pj: -20, ps: -20 },
  { id: 'pen_damage', m: 'PEN', label: '구조물 또는 게임 요소 파손', type: 'manual', pj: 1, ps: 1 },
];

export const PRE_CHECKS = [
  ['start', '시작 위치·게임요소 배치 확인'],
  ['inspect', '로봇 검사 통과 (장식·비상정지·이름표)'],
  ['crew', '경기장 입장 인원 3명 이하'],
] as const;

const n = (v: Values, k: string) => Number(v[k]) || 0;

function autoQty(id: string, v: Values) {
  switch (id) {
    case 'b_samples': return n(v, 's_slot') === 3 ? 1 : 0;
    case 'b_red': return n(v, 'red_h') === 4 ? 1 : 0;
    case 'b_grn': return n(v, 'grn') === 4 ? 1 : 0;
    default: return 0;
  }
}

export const unitPoints = (it: Item, cat: Category) => (cat === 'J' ? it.pj : it.ps);

// 심판이 직접 입력하는 항목 (해당 카테고리에서 배점이 0인 항목은 숨긴다).
// items 는 관리자가 저장한 채점표 템플릿 — 생략하면 기본 항목표(ITEMS)를 쓴다.
export const inputItems = (cat: Category, items: Item[] = ITEMS) =>
  items.filter((it) => it.type !== 'auto' && (it.type === 'manual' || unitPoints(it, cat) !== 0));

export type Line = { it: Item; q: number | null; p: number; sub: number };
export type Calc = { lines: Line[]; sum: Record<Mission, number>; total: number; penCnt: number; dq: boolean };

export function calc(values: Values, cat: Category, items: Item[] = ITEMS): Calc {
  const lines: Line[] = [];
  const sum: Record<Mission, number> = { M1: 0, M2: 0, PEN: 0 };
  let penCnt = 0;

  for (const it of items) {
    const p = unitPoints(it, cat);
    if (it.type !== 'manual' && p === 0) continue;

    let q: number | null;
    if (it.type === 'count') q = n(values, it.id);
    else if (it.type === 'bool') q = values[it.id] ? 1 : 0;
    else if (it.type === 'auto') q = autoQty(it.id, values);
    else q = null;

    const sub = it.type === 'manual' ? damageTotal(values) : (q ?? 0) * p;
    sum[it.m] += sub;
    if (it.m === 'PEN' && ((q ?? 0) > 0 || (it.type === 'manual' && sub))) penCnt += it.type === 'manual' ? 1 : (q ?? 0);
    lines.push({ it, q, p, sub });
  }

  const dq = !!(values.dq || n(values, 'dq_danger') || n(values, 'dq_breach') || values.dq_danger === true || values.dq_breach === true);
  // 순위용 감점 횟수는 심판 화면의 "패널티 횟수"와 같다 (파손·실격 카운터 포함)
  const counted = penaltyCount(values, items);
  return { lines, sum, total: dq ? 0 : sum.M1 + sum.M2 + sum.PEN, penCnt: Math.max(penCnt, counted), dq };
}

// 서버에서 받은 채점표 템플릿을 검증한다. 하나라도 형식이 맞지 않으면 null — 호출 측에서 기본 항목표(ITEMS)로 대체한다.
export function parseTemplate(input: unknown): Item[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const missions: Mission[] = ['M1', 'M2', 'PEN'];
  const types: Item['type'][] = ['count', 'bool', 'auto', 'manual'];
  const ok = input.every((it) => {
    if (typeof it !== 'object' || it === null) return false;
    const o = it as Record<string, unknown>;
    return (
      typeof o.id === 'string' &&
      missions.includes(o.m as Mission) &&
      typeof o.label === 'string' &&
      types.includes(o.type as Item['type']) &&
      typeof o.pj === 'number' &&
      typeof o.ps === 'number' &&
      (o.max === undefined || typeof o.max === 'number')
    );
  });
  return ok ? (input as Item[]) : null;
}

// 일반 벌점 카운터. 파손은 횟수(pen_damage_cnt)와 회차별 심판 재량 점수(pen_damage_pts_N)를 기록하고, 합계는 pen_damage 에 둔다.
// 실격 두 항목은 NO/YES(0/1)로 기록한다. 예전 채점지의 횟수·true 값도 1 이상이면 실격이다.
export const DQ_COUNTERS = [
  { id: 'dq_danger', label: '관중 또는 참가자에게 위험' },
  { id: 'dq_breach', label: '규칙 중대 위반' },
] as const;
export const DAMAGE_COUNT_ID = 'pen_damage_cnt';

const counterValue = (v: Values, id: string) => (v[id] === true ? 1 : n(v, id));

export function penaltyCounters(items: Item[] = ITEMS) {
  const list: { id: string; label: string }[] = [];
  for (const it of items) {
    if (it.m !== 'PEN') continue;
    if (it.type === 'count') list.push({ id: it.id, label: it.label });
    else if (it.type === 'manual') list.push({ id: DAMAGE_COUNT_ID, label: it.label });
  }
  return [...list, ...DQ_COUNTERS];
}

export const reasonKey = (id: string, i: number) => `why:${id}:${i}`;
export const damagePtsKey = (i: number) => `pen_damage_pts_${i}`;

// 사유는 '규칙 중대 위반'과 '구조물 또는 게임 요소 파손'에만 적는다.
export const REASON_IDS: string[] = [DAMAGE_COUNT_ID, 'dq_breach'];

// 파손 회차별 감점(0 이하)을 모두 더한다. 회차별 값이 없는 예전 채점지는 pen_damage 를 그대로 쓴다.
export const damageTotal = (v: Values) => {
  const cnt = counterValue(v, DAMAGE_COUNT_ID);
  if (!Array.from({ length: cnt }, (_, k) => damagePtsKey(k + 1)).some((k) => k in v)) return n(v, 'pen_damage');
  let sum = 0;
  for (let i = 1; i <= cnt; i++) sum += Math.min(0, n(v, damagePtsKey(i)));
  return sum;
};

// 패널티 1회마다 한 줄 (−1 · 항목 이름 · 사유)
export function penaltyEntries(values: Values, items: Item[] = ITEMS) {
  return penaltyCounters(items).flatMap(({ id, label }) =>
    Array.from({ length: counterValue(values, id) }, (_, k) => ({ id, label, key: reasonKey(id, k + 1), reason: String(values[reasonKey(id, k + 1)] ?? '') })),
  );
}

export const penaltyCount = (values: Values, items: Item[] = ITEMS) =>
  penaltyCounters(items).reduce((s, { id }) => s + counterValue(values, id), 0);

// 자동 계산 항목 표시 이름: '보너스: …' → '보너스: … (자동계산)'
export const autoLabel = (label: string) => `${label} (자동계산)`;

// 물리적으로 불가능한 입력 조합. ids 는 붉게 표시할 채점 항목이다.
export type Problem = { msg: string; ids: string[] };
export function validate(values: Values): Problem[] {
  const errors: Problem[] = [];
  const bad = (msg: string, ...ids: string[]) => errors.push({ msg, ids });
  if (n(values, 's_slot') + n(values, 's_out') + n(values, 's_quar') > 3) bad('검체 개수 합계가 3개를 넘었습니다.', 's_slot', 's_out', 's_quar');
  if (values.closed && n(values, 'beam') < 2) bad('격리구역 폐쇄는 빔 2개가 모두 서 있어야 인정됩니다.', 'closed', 'beam');
  if (values.b_kits && n(values, 'kit') < 10) bad('키트 배분 보너스는 의료키트 10개가 모두 H/PCC 안에 있어야 인정됩니다.', 'b_kits', 'kit');
  if (values.b_kits && n(values, 'p_kitzone') > 0) bad('키트 배분 보너스와 "키트 없는 구역"을 함께 표시할 수 없습니다.', 'b_kits', 'p_kitzone');
  if (n(values, 'red_h') + n(values, 'red_out') > 4) bad('빨강 실린더 합계가 4개를 넘었습니다.', 'red_h', 'red_out');
  if (values.b_yel && n(values, 'yel') !== 4) bad('노랑 2 + 2 보너스는 PCC 안 노랑 실린더가 4개여야 인정됩니다.', 'b_yel', 'yel');
  if (n(values, 'yel') + n(values, 'yel_out') > 4) bad('노랑 실린더 합계가 4개를 넘었습니다.', 'yel', 'yel_out');
  if (n(values, 'grn') + n(values, 'grn_out') > 4) bad('초록 실린더 합계가 4개를 넘었습니다.', 'grn', 'grn_out');
  return errors;
}
