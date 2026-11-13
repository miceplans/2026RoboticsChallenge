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
  M1: '미션 1 · 오염물질 및 샘플 관리',
  M2: '미션 2 · 보건의료 관리',
  PEN: '공통 감점',
};

export const ITEMS: Item[] = [
  { id: 's_slot', m: 'M1', label: '실험실 슬롯에 완전히 들어간 샘플', type: 'count', max: 3, pj: 15, ps: 15 },
  { id: 'b_samples', m: 'M1', label: '샘플 3개 모두 슬롯 안 (보너스·자동)', type: 'auto', pj: 5, ps: 5 },
  { id: 's_out', m: 'M1', label: '격리구역·실험실 밖에 있는 샘플', type: 'count', max: 3, pj: 0, ps: -3 },
  { id: 's_quar', m: 'M1', label: '격리구역에 남은 샘플', type: 'count', max: 3, pj: 0, ps: -5 },
  { id: 'beam', m: 'M1', label: '지정 위치에 혼자 서 있는 격리빔', type: 'count', max: 2, pj: 25, ps: 25 },
  { id: 'closed', m: 'M1', label: '빔 2개 + 고정벽 2개로 격리구역 완전 폐쇄', type: 'bool', pj: 20, ps: 20 },
  { id: 'kit_h', m: 'M2', label: '병원(H) 안 의료키트', type: 'count', max: 10, pj: 3, ps: 3 },
  { id: 'kit_l', m: 'M2', label: 'PCC-좌 안 의료키트', type: 'count', max: 10, pj: 3, ps: 3 },
  { id: 'kit_r', m: 'M2', label: 'PCC-우 안 의료키트', type: 'count', max: 10, pj: 3, ps: 3 },
  { id: 'b_kits', m: 'M2', label: '키트 H6·PCC2·PCC2 정확 배분 (보너스·자동)', type: 'auto', pj: 20, ps: 20 },
  { id: 'p_kitzone', m: 'M2', label: '키트가 하나도 없는 목적지 (자동)', type: 'auto', pj: 0, ps: -10 },
  { id: 'red_h', m: 'M2', label: '병원(H) 안 빨강 실린더', type: 'count', max: 4, pj: 5, ps: 5 },
  { id: 'yel_l', m: 'M2', label: 'PCC-좌 안 노랑 실린더', type: 'count', max: 4, pj: 5, ps: 5 },
  { id: 'yel_r', m: 'M2', label: 'PCC-우 안 노랑 실린더', type: 'count', max: 4, pj: 5, ps: 5 },
  { id: 'grn', m: 'M2', label: '회복구역(RZ) 안 초록 실린더', type: 'count', max: 4, pj: 5, ps: 5 },
  { id: 'b_red', m: 'M2', label: '빨강 4개 모두 H (보너스·자동)', type: 'auto', pj: 6, ps: 6 },
  { id: 'b_yel', m: 'M2', label: '노랑 PCC 2·2 분배 (보너스·자동)', type: 'auto', pj: 8, ps: 8 },
  { id: 'b_grn', m: 'M2', label: '초록 4개 모두 RZ (보너스·자동)', type: 'auto', pj: 6, ps: 6 },
  { id: 'red_out', m: 'M2', label: 'H 밖에 있는 빨강 실린더', type: 'count', max: 4, pj: 0, ps: -3 },
  { id: 'yel_out', m: 'M2', label: 'PCC 밖에 있는 노랑 실린더', type: 'count', max: 4, pj: 0, ps: -3 },
  { id: 'grn_out', m: 'M2', label: 'RZ 밖에 있는 초록 실린더', type: 'count', max: 4, pj: 0, ps: -3 },
  { id: 'pen_touch', m: 'PEN', label: '경기 중 로봇 접촉', type: 'count', max: 9, pj: -20, ps: -20 },
  { id: 'pen_field', m: 'PEN', label: '경기장·게임요소 조작', type: 'count', max: 9, pj: -20, ps: -20 },
  { id: 'pen_restart', m: 'PEN', label: '무단 재시작·프로그램 변경', type: 'count', max: 9, pj: -20, ps: -20 },
  { id: 'pen_out', m: 'PEN', label: '로봇이 경기장 밖으로 완전 이탈', type: 'count', max: 9, pj: -20, ps: -20 },
  { id: 'pen_damage', m: 'PEN', label: '구조물·요소 파손 (심판 재량, 점수 직접 입력)', type: 'manual', pj: 1, ps: 1 },
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
    case 'b_kits': return n(v, 'kit_h') === 6 && n(v, 'kit_l') === 2 && n(v, 'kit_r') === 2 ? 1 : 0;
    case 'p_kitzone': return [n(v, 'kit_h'), n(v, 'kit_l'), n(v, 'kit_r')].filter((x) => !x).length;
    case 'b_red': return n(v, 'red_h') === 4 ? 1 : 0;
    case 'b_yel': return n(v, 'yel_l') === 2 && n(v, 'yel_r') === 2 ? 1 : 0;
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

    const sub = it.type === 'manual' ? n(values, it.id) : (q ?? 0) * p;
    sum[it.m] += sub;
    if (it.m === 'PEN' && ((q ?? 0) > 0 || (it.type === 'manual' && sub))) penCnt += it.type === 'manual' ? 1 : (q ?? 0);
    lines.push({ it, q, p, sub });
  }

  const dq = !!(values.dq || values.dq_danger || values.dq_breach);
  return { lines, sum, total: dq ? 0 : sum.M1 + sum.M2 + sum.PEN, penCnt, dq };
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

// 물리적으로 불가능한 입력 조합 (개수 합계 초과)
export function validate(values: Values) {
  const errors: string[] = [];
  if (n(values, 's_slot') + n(values, 's_out') + n(values, 's_quar') > 3) errors.push('샘플 개수 합계가 3개를 넘었어요.');
  if (n(values, 'kit_h') + n(values, 'kit_l') + n(values, 'kit_r') > 10) errors.push('의료키트 합계가 10개를 넘었어요.');
  if (n(values, 'red_h') + n(values, 'red_out') > 4) errors.push('빨강 실린더 합계가 4개를 넘었어요.');
  if (n(values, 'yel_l') + n(values, 'yel_r') + n(values, 'yel_out') > 4) errors.push('노랑 실린더 합계가 4개를 넘었어요.');
  if (n(values, 'grn') + n(values, 'grn_out') > 4) errors.push('초록 실린더 합계가 4개를 넘었어요.');
  return errors;
}
