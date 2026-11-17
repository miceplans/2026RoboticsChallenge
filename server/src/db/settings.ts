import { db } from './connection.ts';

// --- settings (메모리 캐시, 관리자 변경 즉시 반영) ---

const settingsCache = new Map<string, string>();
{
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  for (const r of rows) settingsCache.set(r.key, r.value);
}

export function hasSetting(key: string): boolean {
  return settingsCache.has(key);
}

export function getSetting(key: string, def: string): string {
  return settingsCache.get(key) ?? def;
}
export function getSettingJson<T>(key: string, def: T): T {
  const raw = settingsCache.get(key);
  if (!raw) return def;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return def;
  }
}
export function setSetting(key: string, value: string): void {
  db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').run(key, value, Date.now());
  settingsCache.set(key, value);
}
export function deleteSetting(key: string): void {
  db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  settingsCache.delete(key);
}
export const autoConfirm = () => getSetting('auto_confirm', '0') === '1';
export const boardPublic = () => getSetting('board_public', '1') === '1';
export const hideScores = () => getSetting('hide_scores', '0') === '1';
export const getNotice = () => getSettingJson('notice', { message: '', updatedAt: 0 });
// 설정이 마지막으로 바뀐 시각 — /config 의 updatedAt(캐시 비교용)으로 쓴다. 요청할 때마다 새 값을 내는 게 아니다.
export function getConfigVersion(): number {
  return (db.prepare('SELECT COALESCE(MAX(updated_at), 0) AS m FROM settings').get() as { m: number }).m;
}
export const getTemplate = (): unknown => getSettingJson<unknown | null>('template', null);
export const getRoundScores = (): Record<string, { r1: string; r2: string }> => getSettingJson('round_scores', {});
export const setTemplate = (items: unknown): void => setSetting('template', JSON.stringify(items));

// 당일 진행 순서: 테이블 실행 순서 (1~8 순열). 설정이 없거나 깨졌으면 1~8 기본값.
export function getTableOrder(): number[] {
  const raw = getSettingJson<unknown>('table_order', null);
  const arr = Array.isArray(raw) ? raw.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= 8) : [];
  const uniq = [...new Set(arr)];
  for (let n = 1; n <= 8; n++) if (!uniq.includes(n)) uniq.push(n);
  return uniq;
}

// 관리자 순위 조정: 부문별 팀 ID 배열. 있으면 클라이언트가 계산 순위 대신 이 순서를 쓴다 (동점 8위 결정·드래그 조정).
export function getRankOrder(): { S?: string[]; J?: string[] } {
  const raw = getSettingJson<{ S?: unknown; J?: unknown }>('rank_order', {});
  const pick = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined);
  const out: { S?: string[]; J?: string[] } = {};
  const s = pick(raw?.S); const j = pick(raw?.J);
  if (s?.length) out.S = s;
  if (j?.length) out.J = j;
  return out;
}
export function resetTemplate(): void {
  db.prepare("DELETE FROM settings WHERE key = 'template'").run();
  settingsCache.delete('template');
}
