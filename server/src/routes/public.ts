import {
  autoConfirm,
  boardPublic,
  getConfigVersion,
  getNotice,
  getRankOrder,
  getStandings,
  getTableOrder,
  getTeamScores,
  getTemplate,
  getTournament,
  homologationStatuses,
  getProgress,
  hideScores,
  listMatches,
  listTeams,
} from '../db.ts';
import type { Session } from '../session.ts';
import { Router, query, requireSession } from '../router.ts';
import { json } from '../http.ts';
import { str } from '../validate.ts';

// --- 인증 필요 조회 API (공개 순위판 설정이 켜져 있으면 /config 는 비로그인도 일부 조회 가능) ---

export type TeamScoresResult = { ok: true; scores: ReturnType<typeof getTeamScores> } | { ok: false; error: string };

export function createPublicRoutes(): Router {
  const r = new Router();

  // 대회 전체 설정(공개분)·채점표 템플릿·팀·대진·토너먼트를 한 번에. 클라이언트는 updatedAt 으로 캐시를 비교한다.
  // 팀 명단은 역할별로 최소화한다 — 참가자에게 다른 팀의 지역·소속·코치·참가자 명단(미성년자 정보)을 내주지 않는다.
  r.get('/config', (ctx) => {
    const session: Session | null = ctx.session;
    // 공개 순위판에서는 팀 이름을 표시할 수 있어야 한다. 비로그인 요청에는
    // 순위판에 필요한 팀 식별 정보만 제공하고, 참가자 개인정보는 제외한다.
    if (!session) {
      if (!boardPublic()) return void json(ctx.res, 401, { ok: false, error: 'unauthorized' });
      const teams = listTeams().map(({ id, cat, code, name }) => ({ id, cat, code, name, region: '', org: '', coach: '', members: [] }));
      return void json(ctx.res, 200, {
        ok: true,
        config: {
          updatedAt: getConfigVersion(),
          settings: {
            autoConfirm: false,
            boardPublic: true,
            notice: getNotice(),
            tableOrder: [],
            rankOrder: getRankOrder(),
          },
          template: null,
          teams,
          // 공개 '조 추첨' 탭용 (칸 위치와 팀 ID 만 담고 있어 개인정보가 없다)
          matches: listMatches(),
          tournament: getTournament(),
        },
      });
    }
    const isStaff = session.role !== 'user';
    const teams = listTeams().map((t) =>
      isStaff || t.id === session.teamId
        ? t
        : { ...t, region: '', org: '', coach: '', members: [] },
    );
    // 로봇 승인 여부(팀 이름 옆 체크·X)는 심판·관리자에게는 전 팀, 참가자에게는 자기 팀 것만 보낸다
    const allStatuses = homologationStatuses();
    const homologation = isStaff
      ? allStatuses
      : session.teamId && allStatuses[session.teamId] ? { [session.teamId]: allStatuses[session.teamId] } : {};
    json(ctx.res, 200, {
      ok: true,
      config: {
        updatedAt: getConfigVersion(),
        settings: {
          autoConfirm: autoConfirm(),
          boardPublic: boardPublic(),
          notice: getNotice(),
          tableOrder: getTableOrder(),
          rankOrder: getRankOrder(),
        },
        template: getTemplate(),
        teams,
        matches: listMatches(),
        tournament: getTournament(),
        progress: getProgress(),
        homologation,
      },
    });
  });

  // 순위판 스냅샷. 소켓 끊김 시 재검증용. 보드 비공개 설정을 반영한다.
  r.get('/standings', requireSession, (ctx) => {
    const s = ctx.session!;
    const visible = boardPublic() || s.role === 'admin';
    json(ctx.res, 200, { ok: true, standings: visible ? getStandings() : [] });
  });

  // 팀 채점 표: 참가자는 자기 팀만, 심판/관리자는 모든 팀을 조회할 수 있다.
  // '점수 가리기' 설정이 켜져 있으면 참가자 조회를 막는다.
  r.get('/team-scores', requireSession, query({ teamId: str({ min: 1, max: 64 }) }), (ctx) => {
    const s = ctx.session!;
    const { teamId } = ctx.query as { teamId: string };
    if (s.role === 'user' && (s.teamId !== teamId || hideScores())) return void json(ctx.res, 403, { ok: false, error: 'forbidden' });
    const body: TeamScoresResult = { ok: true, scores: getTeamScores(teamId) };
    json(ctx.res, 200, body);
  });

  return r;
}
