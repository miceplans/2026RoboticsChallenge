import { getProgress, logAudit, submitTournamentScore } from '../db.ts';
import { Router, body, type Guard } from '../router.ts';
import { json } from '../http.ts';
import { num, obj, oneOf } from '../validate.ts';

// --- 심판 API ---

// 심판+관리자만 통과. 비밀번호를 바꾸지 않은 재발급 계정은 쓰기를 못 한다.
const judgeOnly: Guard = (ctx) => {
  const s = ctx.session;
  if (!s || (s.role !== 'judge' && s.role !== 'admin')) return void json(ctx.res, 403, { ok: false, error: 'forbidden' }), false;
  if (s.mc) return void json(ctx.res, 403, { ok: false, error: 'password_change_required' }), false;
  return true;
};

const tournamentScoreBody = obj({
  cat: oneOf('J', 'S'),
  round: oneOf('QF', 'SF', 'F', '3P'),
  gameNo: num({ int: true }),
  scoreA: num({ min: 0, max: 9999 }),
  scoreB: num({ min: 0, max: 9999 }),
});

export function createJudgeRoutes(hooks: { broadcastConfig: () => void }): Router {
  const r = new Router();

  // 심판의 토너먼트 경기 점수 제출. 결과로 저장되는 건 관리자가 칸별로 '확정' 할 때다.
  r.post('/judge/tournament/score', judgeOnly, body(tournamentScoreBody, 4096), (ctx) => {
    const { cat, round, gameNo, scoreA, scoreB } = ctx.body as ReturnType<typeof tournamentScoreBody>;
    if (!getProgress()[cat].tournamentOpen) return void json(ctx.res, 409, { ok: false, error: '예선이 끝나야 토너먼트 점수를 입력할 수 있습니다.' });
    try {
      submitTournamentScore(cat, round, gameNo, scoreA, scoreB, ctx.session!.id);
    } catch (e) {
      return void json(ctx.res, 409, { ok: false, error: (e as Error).message });
    }
    logAudit(ctx.session!.id, 'tournament', 'tournament', `${cat} ${round}-${gameNo}`, { submit: { scoreA, scoreB } });
    hooks.broadcastConfig();
    json(ctx.res, 200, { ok: true });
  });

  return r;
}
