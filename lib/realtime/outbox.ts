// 심판이 제출한 점수를 IndexedDB 에 영구 보관한다. 서버가 확인한 뒤에도 지우지 않는다.
// - status 'pending'  : 서버 확인 전 → 재전송 대상 (전송 큐 역할)
// - status 'acked'    : 서버가 저장 확인함 → 기록으로 남김. 서버 DB 를 잃었을 때 재전송으로 복원할 수 있다.
// - status 'rejected' : 서버가 거부함(invalid/forbidden)
// (경기, 팀) 당 최신 1건만 유지한다. 서버가 ts 가 더 큰 값만 반영하므로 이전 값은 필요 없다.
// IndexedDB 를 쓸 수 없는 환경(사생활 보호 모드 등)에서는 조용히 무시하고 메모리로만 동작한다.
// sheet: 채점지 전체(항목별 값, 서명 등). 점수(points)와 함께 서버에 저장된다.
export type Score = { matchId: string; teamId: string; points: number; ts: number; sheet?: Record<string, unknown> };
export type Status = 'pending' | 'acked' | 'rejected';
export type LedgerEntry = Score & { status: Status };

const STORE = 'scores';

export const scoreKey = (s: Pick<Score, 'matchId' | 'teamId'>) => `${s.matchId}:${s.teamId}`;

let dbPromise: Promise<IDBDatabase> | null = null;
const openDb = () =>
  (dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('score-outbox', 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const saveEntry = (e: LedgerEntry) => run('readwrite', (st) => st.put(e, scoreKey(e))).then(() => {}, () => {});

// 상태 변경. 그 사이 같은 키로 더 새로운 점수가 저장됐다면 덮어쓰지 않는다.
export async function markStatus(s: Score, status: Status) {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const get = store.get(scoreKey(s));
      get.onsuccess = () => {
        const cur = get.result as LedgerEntry | undefined;
        if (cur && cur.ts === s.ts) store.put({ ...cur, status }, scoreKey(s));
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

// status 가 없는 이전 형식의 항목은 미확인(pending)으로 취급한다
export const loadLedger = () =>
  run<LedgerEntry[]>('readonly', (st) => st.getAll()).then(
    (all) => all.map((e) => ({ ...e, status: e.status ?? 'pending' })),
    () => [] as LedgerEntry[],
  );

// 브라우저가 저장 공간 부족 시 IndexedDB/localStorage 를 임의로 비우지 못하게 요청
export const requestPersistentStorage = () => navigator.storage?.persist?.().catch(() => {});

// 마지막으로 받은 순위표. 오프라인에서 새로고침해도 빈 화면이 되지 않게 한다.
const STANDINGS_KEY = 'last-standings';
export type CachedStandings<T> = { at: number; data: T };

export function cacheStandings<T>(data: T) {
  try {
    localStorage.setItem(STANDINGS_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch {}
}

export function readCachedStandings<T>(): CachedStandings<T> | null {
  try {
    return JSON.parse(localStorage.getItem(STANDINGS_KEY) ?? 'null');
  } catch {
    return null;
  }
}
