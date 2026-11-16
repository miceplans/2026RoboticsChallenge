import type { IncomingMessage, ServerResponse } from 'node:http';
import { getMatch, getProgress, judgeTableOf, saveScore } from '../db.ts';
import type { Session } from '../session.ts';
import { json, readJson } from '../http.ts';

// --- 점수 제출 (심판 채점) ---

export type SubmitPayload = { matchId: unknown; teamId: unknown; points: unknown; ts: unknown; sheet?: unknown; penCnt?: unknown };
export type Result = { ok: true } | { ok: false; error: string };

// 채점지(서명 이미지 포함) 상한. 초과분은 거부한다.
export const MAX_SHEET_BYTES = 400 * 1024;
export const MAX_BODY_BYTES = MAX_SHEET_BYTES + 4096;

// 제출은 실제 대진과 대조해 검증한다: 존재하는 경기인지, 팀이 그 경기 팀인지, 심판 담당 테이블이 맞는지.
// ts 는 미래로 5분 이상 틀어진 것을 거부한다 — 심판 기기 시계가 미래로 가면 이후 정상 제출이 전부 무시되는 것을 막는다.
export function submitScore(session: Session, p: SubmitPayload | undefined): Result {
  if (session.role !== 'judge' && session.role !== 'admin') return { ok: false, error: 'forbidden' };
  // 관리자가 재발급한 비밀번호로 첫 로그인한 계정은 비밀번호를 바꾸기 전까지 점수를 제출할 수 없다.
  if (session.mc) return { ok: false, error: 'password_change_required' };

  const { matchId, teamId, points, ts, sheet, penCnt } = p ?? {};
  if (
    typeof matchId !== 'string' || !matchId || matchId.length > 64 ||
    typeof teamId !== 'string' || !teamId || teamId.length > 64 ||
    typeof points !== 'number' || !Number.isFinite(points) || points < -1000 || points > 10000 ||
    typeof ts !== 'number' || !Number.isFinite(ts) ||
    (penCnt !== undefined && (typeof penCnt !== 'number' || !Number.isInteger(penCnt) || penCnt < 0 || penCnt > 999)) ||
    (sheet !== undefined && (typeof sheet !== 'object' || sheet === null || Array.isArray(sheet)))
  ) {
    return { ok: false, error: 'invalid' };
  }
  const sheetJson = sheet === undefined ? null : JSON.stringify(sheet);
  if (sheetJson && sheetJson.length > MAX_SHEET_BYTES) return { ok: false, error: 'too_large' };

  // 클라이언트 시계 오류(미래)로 이후 제출이 잠기는 것을 막는다
  if (ts > Date.now() + 5 * 60_000) return { ok: false, error: 'invalid_ts' };

  const match = getMatch(matchId);
  if (!match) return { ok: false, error: 'unknown_match' };
  if (match.team !== teamId) return { ok: false, error: 'team_mismatch' };
  // 1차가 끝나기 전에는 2차 점수를 받지 않는다 (관리자는 불참팀 0점 처리 등 예외 입력 가능)
  if (match.round === 2 && session.role !== 'admin' && !getProgress()[match.cat].round2Open) return { ok: false, error: 'round_locked' };
  if (session.role === 'judge') {
    const table = judgeTableOf(session.id);
    if (table !== null && match.table !== table) return { ok: false, error: 'not_your_table' };
  }

  // judgeId 는 클라이언트가 보낸 값이 아니라 세션에서만 가져온다
  saveScore({ matchId, teamId, judgeId: session.id, points, ts, sheet: sheetJson, penCnt });
  return { ok: true };
}

// WebSocket 이 막히거나 불안정할 때 클라이언트가 쓰는 평번: POST /score
export async function handleScore(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  session: Session | null,
  hooks: { onSaved: () => void },
): Promise<boolean> {
  if (method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' }), true;
  if (!session) return json(res, 401, { ok: false, error: 'unauthorized' }), true;
  const body = await readJson(req, MAX_BODY_BYTES);
  if (body === null) return json(res, 413, { ok: false, error: 'too_large' }), true;
  const result = submitScore(session, body as SubmitPayload | undefined);
  if (result.ok) hooks.onSaved();
  json(res, result.ok ? 200 : result.error === 'forbidden' || result.error === 'password_change_required' ? 403 : result.error === 'internal' ? 500 : 400, result);
  return true;
}
