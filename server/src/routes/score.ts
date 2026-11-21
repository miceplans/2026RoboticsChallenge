import { getMatch, getProgress, parseTournamentMatchId, saveScore, saveTournamentSheet } from '../db.ts';
import type { Session } from '../session.ts';
import { Router, body, requireSession } from '../router.ts';
import { json } from '../http.ts';
import { jsonObj, num, obj, opt, str } from '../validate.ts';

// --- 점수 제출 (심판 채점) ---

export type Result = { ok: true } | { ok: false; error: string };

// 채점지(서명 이미지 포함) 상한. 초과분은 거부한다.
export const MAX_SHEET_BYTES = 400 * 1024;
export const MAX_BODY_BYTES = MAX_SHEET_BYTES + 4096;

// HTTP 평번 본문 스키마. WebSocket score:submit 은 여기를 거치지 않으므로
// submitScore 안에도 동일 조건의 검증을 둔다 (한 곳만 바꾸면 어긋난다).
const submitBody = obj({
  matchId: str({ min: 1, max: 64 }),
  teamId: str({ min: 1, max: 64 }),
  points: num({ min: -1000, max: 10000 }),
  ts: num(),
  sheet: opt(jsonObj),
  penCnt: opt(num({ int: true, min: 0, max: 999 })),
});
type SubmitBody = ReturnType<typeof submitBody>;

// 제출은 실제 대진과 대조해 검증한다: 존재하는 경기인지, 팀이 그 경기 팀인지. (심판에게 조 배정은 없다 — 어느 심판이든 어느 경기든 채점할 수 있다.)
// ts 는 미래로 5분 이상 틀어진 것을 거부한다 — 심판 기기 시계가 미래로 가면 이후 정상 제출이 전부 무시되는 것을 막는다.
// p 는 미검증 값(WebSocket score:submit 도 여기로 온다) — 아래 검증을 반드시 통과해야 한다.
export function submitScore(session: Session, p: unknown): Result {
  if (session.role !== 'judge') return { ok: false, error: 'forbidden' };

  // 재발급한 비밀번호로 첫 로그인한 심판은 비밀번호를 바꾸기 전까지 점수를 제출할 수 없다.
  if (session.mc) return { ok: false, error: 'password_change_required' };
  const { matchId, teamId, points, ts, sheet, penCnt } = (p ?? {}) as {
    matchId?: unknown; teamId?: unknown; points?: unknown; ts?: unknown; sheet?: unknown; penCnt?: unknown;
  };
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

  // 토너먼트 팀별 채점지: 경기 점수(/judge/tournament/score)와 별개로 서명 포함 채점지를 보관한다
  if (parseTournamentMatchId(matchId)) {
    if (!getProgress()[parseTournamentMatchId(matchId)!.cat].tournamentOpen) return { ok: false, error: 'round_locked' };
    const err = saveTournamentSheet(matchId, teamId, session.id, points, ts, sheetJson);
    return err ? { ok: false, error: err } : { ok: true };
  }

  const match = getMatch(matchId);
  if (!match) return { ok: false, error: 'unknown_match' };
  if (match.team !== teamId) return { ok: false, error: 'team_mismatch' };
  // 1차가 끝나기 전에는 2차 점수를 받지 않는다.
  if (match.round === 2 && !getProgress()[match.cat].round2Open) return { ok: false, error: 'round_locked' };

  // judgeId 는 클라이언트가 보낸 값이 아니라 세션에서만 가져온다
  saveScore({ matchId, teamId, judgeId: session.id, points, ts, sheet: sheetJson, penCnt });
  return { ok: true };
}

// WebSocket 이 막히거나 불안정할 때 클라이언트가 쓰는 평번: POST /score
export function createScoreRoutes(hooks: { onSaved: () => void }): Router {
  const r = new Router();
  r.post('/score', requireSession, body(submitBody, MAX_BODY_BYTES, { nullStatus: 413 }), (ctx) => {
    const result = submitScore(ctx.session!, ctx.body as SubmitBody | undefined);
    if (result.ok) hooks.onSaved();
    json(
      ctx.res,
      result.ok ? 200 : result.error === 'forbidden' || result.error === 'password_change_required' ? 403 : result.error === 'internal' ? 500 : 400,
      result,
    );
  });
  return r;
}
