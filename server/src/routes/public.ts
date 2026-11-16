import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  autoConfirm,
  boardPublic,
  getConfigVersion,
  getJudgeTables,
  getNotice,
  getRankOrder,
  getStandings,
  getTableOrder,
  getTeamScores,
  getTemplate,
  getTournament,
  getProgress,
  hideScores,
  listMatches,
  listTeams,
} from '../db.ts';
import type { Session } from '../session.ts';
import { bad, json } from '../http.ts';

// --- 인증 필요 조회 API (공개 순위판 설정이 켜져 있으면 /config 는 비로그인도 일부 조회 가능) ---

export type TeamScoresResult = { ok: true; scores: ReturnType<typeof getTeamScores> } | { ok: false; error: string };

export function handlePublic(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  method: string,
  session: Session | null,
): boolean {
  // 대회 전체 설정(공개분)·채점표 템플릿·팀·대진·토너먼트를 한 번에. 클라이언트는 updatedAt 으로 캐시를 비교한다.
  // 팀 명단은 역할별로 최소화한다 — 참가자에게 다른 팀의 지역·소속·코치·참가자 명단(미성년자 정보)을 내주지 않는다.
  if (url.pathname === '/config' && method === 'GET') {
    // 공개 순위판에서는 팀 이름을 표시할 수 있어야 한다. 비로그인 요청에는
    // 순위판에 필요한 팀 식별 정보만 제공하고, 참가자 개인정보는 제외한다.
    if (!session) {
      if (!boardPublic()) return json(res, 401, { ok: false, error: 'unauthorized' }), true;
      const teams = listTeams().map(({ id, cat, code, name }) => ({ id, cat, code, name, region: '', org: '', coach: '', members: [] }));
      return json(res, 200, {
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
          judgeTables: {},
          teams,
          matches: [],
          tournament: getTournament(),
        },
      }), true;
    }
    const isStaff = session.role !== 'user';
    const teams = listTeams().map((t) =>
      isStaff || t.id === session.teamId
        ? t
        : { ...t, region: '', org: '', coach: '', members: [] },
    );
    const allTables = getJudgeTables();
    const judgeTables =
      session.role === 'admin' ? allTables : session.role === 'judge' && allTables[session.id] !== undefined ? { [session.id]: allTables[session.id] } : {};
    return json(res, 200, {
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
        judgeTables,
        teams,
        matches: listMatches(),
        tournament: getTournament(),
        progress: getProgress(),
      },
    }), true;
  }

  // 순위판 스냅샷. 소켓 끊김 시 재검증용. 보드 비공개 설정을 반영한다.
  if (url.pathname === '/standings' && method === 'GET') {
    if (!session) return json(res, 401, { ok: false, error: 'unauthorized' }), true;
    const visible = boardPublic() || session.role === 'admin';
    return json(res, 200, { ok: true, standings: visible ? getStandings() : [] }), true;
  }

  // 팀 채점 표: 참가자는 자기 팀만, 심판/관리자는 모든 팀을 조회할 수 있다.
  // '점수 가리기' 설정이 켜져 있으면 참가자 조회를 막는다.
  if (url.pathname === '/team-scores' && method === 'GET') {
    if (!session) return json(res, 401, { ok: false, error: 'unauthorized' }), true;
    const teamId = url.searchParams.get('teamId') ?? '';
    if (!teamId || teamId.length > 64) return bad(res), true;
    if (session.role === 'user' && (session.teamId !== teamId || hideScores())) return json(res, 403, { ok: false, error: 'forbidden' }), true;
    const body: TeamScoresResult = { ok: true, scores: getTeamScores(teamId) };
    return json(res, 200, body), true;
  }

  return false;
}
