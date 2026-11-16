import type { IncomingMessage, ServerResponse } from 'node:http';
import { getProgress, logAudit, submitTournamentScore, type TournamentRound } from '../db.ts';
import type { Session } from '../session.ts';
import { bad, json, readJson } from '../http.ts';

// --- 심판 API ---

export async function handleJudge(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  method: string,
  session: Session | null,
  hooks: { broadcastConfig: () => void },
): Promise<boolean> {
  // 심판의 토너먼트 경기 점수 제출. 결과로 저장되는 건 관리자가 칸별로 '확정' 할 때다.
  if (url.pathname === '/judge/tournament/score' && method === 'POST') {
    if (!session || (session.role !== 'judge' && session.role !== 'admin')) return json(res, 403, { ok: false, error: 'forbidden' }), true;
    if (session.mc) return json(res, 403, { ok: false, error: 'password_change_required' }), true;
    const body = (await readJson(req, 4096)) as { cat?: unknown; round?: unknown; gameNo?: unknown; scoreA?: unknown; scoreB?: unknown } | null;
    const { cat, round, gameNo, scoreA, scoreB } = body ?? {};
    if ((cat !== 'J' && cat !== 'S') || (round !== 'QF' && round !== 'SF' && round !== 'F' && round !== '3P') || !Number.isInteger(gameNo)) return bad(res), true;
    if (typeof scoreA !== 'number' || typeof scoreB !== 'number' || !Number.isFinite(scoreA) || !Number.isFinite(scoreB) || scoreA < 0 || scoreB < 0 || scoreA > 9999 || scoreB > 9999) return bad(res), true;
    if (!getProgress()[cat].tournamentOpen) return json(res, 409, { ok: false, error: '예선이 끝나야 토너먼트 점수를 입력할 수 있습니다.' }), true;
    try {
      submitTournamentScore(cat, round as TournamentRound, gameNo as number, scoreA, scoreB, session.id);
    } catch (e) {
      return json(res, 409, { ok: false, error: (e as Error).message }), true;
    }
    logAudit(session.id, 'tournament', 'tournament', `${cat} ${round}-${gameNo}`, { submit: { scoreA, scoreB } });
    hooks.broadcastConfig();
    return json(res, 200, { ok: true }), true;
  }

  return false;
}
