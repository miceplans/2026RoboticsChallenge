// 입력 스키마 검증 — 의존성 없는 미니 검증기. 라우트 본문·쿼리를 선언적으로 검증한다.
// 검증 실패는 ValidationError 를 던지고, router.ts 의 body() 가 400 으로 응답한다.

export type V<T> = (value: unknown) => T;

export class ValidationError extends Error {
  constructor(message = 'invalid') {
    super(message);
    this.name = 'ValidationError';
  }
}

function fail(msg = 'invalid'): never {
  throw new ValidationError(msg);
}

const isPlainObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export const str = (o: { min?: number; max?: number; re?: RegExp } = {}): V<string> => (v) => {
  if (typeof v !== 'string') fail();
  if (o.min !== undefined && v.length < o.min) fail();
  if (o.max !== undefined && v.length > o.max) fail();
  if (o.re && !o.re.test(v)) fail();
  return v;
};

export const num = (o: { min?: number; max?: number; int?: boolean } = {}): V<number> => (v) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail();
  if (o.int && !Number.isInteger(v)) fail();
  if (o.min !== undefined && v < o.min) fail();
  if (o.max !== undefined && v > o.max) fail();
  return v;
};

// 문자열 또는 숫자 (1·2라운드 심사 점수 같은 자유 입력 값).
export const strOrNum: V<string | number> = (v) => {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  fail();
};

export const bool: V<boolean> = (v) => {
  if (typeof v !== 'boolean') fail();
  return v;
};

export const oneOf = <T extends string | number>(...values: T[]): V<T> => (v) => {
  if ((typeof v !== 'string' && typeof v !== 'number') || !values.includes(v as T)) fail();
  return v as T;
};

// undefined 는 통과한다 (선택 필드). null 은 nullable() 과 조합한다.
export const opt = <T>(item: V<T>): V<T | undefined> => (v) => (v === undefined ? undefined : item(v));

// null 을 허용한다 (비우기 허용 필드).
export const nullable = <T>(item: V<T>): V<T | null> => (v) => (v === null ? null : item(v));

export const arr = <T>(item: V<T>, o: { min?: number; max?: number } = {}): V<T[]> => (v) => {
  if (!Array.isArray(v)) fail();
  if (o.min !== undefined && v.length < o.min) fail();
  if (o.max !== undefined && v.length > o.max) fail();
  return v.map((x) => item(x));
};

export type Shape = Record<string, V<unknown>>;

// 고정 형태 객체. 선언한 키만 검증하고, 추가 키는 그대로 둔다 (클이언트가 여분 필드를 별내는 경우를 깨지 않게).
export const obj = <T extends Shape>(shape: T): V<{ [K in keyof T]: ReturnType<T[K]> }> => (v) => {
  if (!isPlainObj(v)) fail();
  const out: Record<string, unknown> = {};
  for (const [k, s] of Object.entries(shape)) out[k] = s(v[k]);
  return out as { [K in keyof T]: ReturnType<T[K]> };
};

// 모든 값이 item 을 통과하는 사전 (roundScores 같은 팀 ID → 값 맵).
export const rec = <T>(item: V<T>): V<Record<string, T>> => (v) => {
  if (!isPlainObj(v)) fail();
  const out: Record<string, T> = {};
  for (const [k, x] of Object.entries(v)) out[k] = item(x);
  return out;
};

// 값 형태가 고정되지 않은 객체 (sheet 같은 JSON 값).
export const jsonObj: V<Record<string, unknown>> = (v) => {
  if (!isPlainObj(v)) fail();
  return v;
};

// --- 쿼리스트링용 — router.ts 의 query() 가 넘기는 문자열|null 값을 받는다 ---

// null(파라미터 없음) 은 통과한다 (선택 파라미터). 값이 있으면 item 검증.
export const qOpt = <T>(item: V<T>): V<T | undefined> => (v) => (v === null ? undefined : item(v));

// 문자열을 Number 로 바꿔 검증한다 (빈 문자열·NaN 거부). limit 같은 숫자 파라미터용.
export const qNum = (o: { min?: number; max?: number; int?: boolean } = {}): V<number> => (v) => {
  if (typeof v !== 'string' || v.trim() === '') fail();
  const n = Number(v);
  if (!Number.isFinite(n)) fail();
  if (o.int && !Number.isInteger(n)) fail();
  if (o.min !== undefined && n < o.min) fail();
  if (o.max !== undefined && n > o.max) fail();
  return n;
};
