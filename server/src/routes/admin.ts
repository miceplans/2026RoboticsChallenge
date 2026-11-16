import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  assignJudgeTable,
  autoConfirm,
  boardPublic,
  confirmScore,
  countScores,
  deleteSetting,
  getActivity,
  getNotice,
  getOverview,
  getPending,
  getProgress,
  getRankOrder,
  getRoundScores,
  getTableOrder,
  getTemplate,
  hideScores,
  issueAccounts,
  listScores,
  listSheets,
  listUsers,
  logAudit,
  modifyScore,
  rejectScore,
  replaceMatches,
  replaceTeams,
  resetPasswords,
  resetTemplate,
  reopenTournamentGame,
  revokeAllSessions,
  saveTournamentResult,
  saveTournamentSlots,
  setSetting,
  setTemplate,
  setTournamentTeam,
  type AccountRole,
  type ScoreStatus,
  type TournamentRound,
} from '../db.ts';
import type { Session } from '../session.ts';
import { bad, json, readJson } from '../http.ts';

// --- 관리자 API (role=admin 전용) ---

// 팀 명단 Import 등 관리자 JSON 본문 상한
const MAX_ADMIN_BODY_BYTES = 1024 * 1024;

export async function handleAdmin(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  method: string,
  session: Session,
  hooks: {
    broadcastConfig: () => void;
    emitLeaderboard: () => void;
    emitNotice: (notice: { message: string; updatedAt: number }) => void;
    onScoresChanged: () => void;
  },
): Promise<boolean> {
  if (url.pathname === '/admin/activity' && method === 'GET') {
    const limit = Number(url.searchParams.get('limit') ?? 50);
    return json(res, 200, { ok: true, activity: getActivity(Number.isInteger(limit) && limit > 0 ? limit : 50) }), true;
  }

  // 대시보드 집계
  if (url.pathname === '/admin/overview' && method === 'GET') {
    return json(res, 200, { ok: true, overview: getOverview() }), true;
  }

  // 설정 조회 (관리자 전용 값 포함: 점수 가리기, 1·2라운드 심사 점수, 테이블 진행 순서, 순위 조정)
  if (url.pathname === '/admin/settings' && method === 'GET') {
    return json(res, 200, {
      ok: true,
      settings: {
        autoConfirm: autoConfirm(),
        boardPublic: boardPublic(),
        hideScores: hideScores(),
        notice: getNotice(),
        roundScores: getRoundScores(),
        tableOrder: getTableOrder(),
        rankOrder: getRankOrder(),
      },
    }), true;
  }

  // 채점표 템플릿: 저장된 값(null 이면 rules.ts 기본값)과 저장·복원
  if (url.pathname === '/admin/template' && method === 'GET') {
    return json(res, 200, { ok: true, template: getTemplate() }), true;
  }
  if (url.pathname === '/admin/template' && method === 'PUT') {
    const body = (await readJson(req, MAX_ADMIN_BODY_BYTES)) as { items?: unknown } | null;
    const items = body?.items;
    if (!Array.isArray(items) || items.length === 0) return bad(res), true;
    for (const it of items as { id?: unknown; m?: unknown; label?: unknown; type?: unknown; pj?: unknown; ps?: unknown; max?: unknown }[]) {
      if (typeof it.id !== 'string' || typeof it.label !== 'string') return bad(res), true;
      if (it.m !== 'M1' && it.m !== 'M2' && it.m !== 'PEN') return bad(res), true;
      if (it.type !== 'count' && it.type !== 'bool' && it.type !== 'auto' && it.type !== 'manual') return bad(res), true;
      if (typeof it.pj !== 'number' || !Number.isFinite(it.pj) || typeof it.ps !== 'number' || !Number.isFinite(it.ps)) return bad(res), true;
      if (it.max !== undefined && !Number.isInteger(it.max)) return bad(res), true;
    }
    setTemplate(items);
    logAudit(session.id, 'template', 'template', null, { count: items.length });
    hooks.broadcastConfig();
    return json(res, 200, { ok: true }), true;
  }
  if (url.pathname === '/admin/template/reset' && method === 'POST') {
    resetTemplate();
    logAudit(session.id, 'template', 'template', null, { reset: true });
    hooks.broadcastConfig();
    return json(res, 200, { ok: true }), true;
  }

  // 토너먼트 8슬롯 배정 저장 → /contest 대진표에 즉시 반영 (config 브로드캐스트)
  if (url.pathname === '/admin/tournament/slots' && method === 'PUT') {
    const body = (await readJson(req, MAX_ADMIN_BODY_BYTES)) as { cat?: unknown; teamIds?: unknown } | null;
    const cat = body?.cat;
    const teamIds = body?.teamIds;
    if ((cat !== 'J' && cat !== 'S') || !Array.isArray(teamIds) || teamIds.length !== 8) return bad(res), true;
    if (!teamIds.every((t) => t === null || (typeof t === 'string' && t.length <= 16))) return bad(res), true;
    // 예선(1·2차)이 모두 확정되기 전에는 8강 배정을 저장할 수 없다 (전부 비우는 초기화는 허용)
    if (teamIds.some((t) => t !== null) && !getProgress()[cat].tournamentOpen) {
      return json(res, 409, { ok: false, error: '예선(1·2차) 점수가 모두 확정된 뒤에 8강을 배정할 수 있습니다.' }), true;
    }
    saveTournamentSlots(cat, teamIds as (string | null)[]);
    logAudit(session.id, 'tournament', 'tournament', cat, { slots: teamIds.filter(Boolean).length });
    hooks.broadcastConfig();
    return json(res, 200, { ok: true }), true;
  }

  // 토너먼트 경기 결과 저장. 승자가 다음 라운드로 진출하고, 준결승 패자는 3·4위전으로 간다.
  // 무승부는 허용하지 않는다. 같은 경기를 다시 저장하면 하위 라운드까지 다시 계산된다.
  if (url.pathname === '/admin/tournament/result' && method === 'POST') {
    const body = (await readJson(req, MAX_ADMIN_BODY_BYTES)) as { cat?: unknown; round?: unknown; gameNo?: unknown; scoreA?: unknown; scoreB?: unknown; winner?: unknown } | null;
    const { cat, round, gameNo, scoreA, scoreB, winner } = body ?? {};
    if ((cat !== 'J' && cat !== 'S') || (round !== 'QF' && round !== 'SF' && round !== 'F' && round !== '3P')) return bad(res), true;
    if (!Number.isInteger(gameNo) || typeof scoreA !== 'number' || !Number.isFinite(scoreA) || typeof scoreB !== 'number' || !Number.isFinite(scoreB)) return bad(res), true;
    try {
      saveTournamentResult(cat, round as TournamentRound, gameNo as number, scoreA, scoreB, winner === 'A' || winner === 'B' ? winner : undefined);
    } catch (e) {
      return json(res, 400, { ok: false, error: (e as Error).message }), true;
    }
    logAudit(session.id, 'tournament', 'tournament', `${cat} ${round}-${gameNo}`, { scoreA, scoreB, winner });
    hooks.broadcastConfig();
    return json(res, 200, { ok: true }), true;
  }

  // 확정된 경기를 다시 열어 심판이 점수를 다시 입력하게 한다 (이 경기와 하위 라운드 결과는 지워진다)
  if (url.pathname === '/admin/tournament/reopen' && method === 'POST') {
    const body = (await readJson(req, MAX_ADMIN_BODY_BYTES)) as { cat?: unknown; round?: unknown; gameNo?: unknown } | null;
    const { cat, round, gameNo } = body ?? {};
    if ((cat !== 'J' && cat !== 'S') || (round !== 'QF' && round !== 'SF' && round !== 'F' && round !== '3P') || !Number.isInteger(gameNo)) return bad(res), true;
    try {
      reopenTournamentGame(cat, round as TournamentRound, gameNo as number);
    } catch (e) {
      return json(res, 400, { ok: false, error: (e as Error).message }), true;
    }
    logAudit(session.id, 'tournament', 'tournament', `${cat} ${round}-${gameNo}`, { reopen: true });
    hooks.broadcastConfig();
    return json(res, 200, { ok: true }), true;
  }

  // 준결승 이후 슬롯에 팀을 직접 지정 (기권·부전승 등). 빈 칸(null)으로 비울 수도 있다.
  // 해당 경기 결과는 지워지고, 상위 라운드 결과를 다시 저장하면 자동 배정으로 덮인다.
  if (url.pathname === '/admin/tournament/set-team' && method === 'POST') {
    const body = (await readJson(req, MAX_ADMIN_BODY_BYTES)) as { cat?: unknown; round?: unknown; gameNo?: unknown; side?: unknown; teamId?: unknown } | null;
    const { cat, round, gameNo, side, teamId } = body ?? {};
    if ((cat !== 'J' && cat !== 'S') || (round !== 'SF' && round !== 'F' && round !== '3P') || !Number.isInteger(gameNo)) return bad(res), true;
    if (side !== 'A' && side !== 'B') return bad(res), true;
    if (teamId !== null && (typeof teamId !== 'string' || teamId.length > 16)) return bad(res), true;
    try {
      if (!setTournamentTeam(cat, round as TournamentRound, gameNo as number, side, teamId)) return json(res, 404, { ok: false, error: 'game_not_found' }), true;
    } catch (e) {
      return json(res, 409, { ok: false, error: (e as Error).message }), true;
    }
    logAudit(session.id, 'tournament', 'tournament', `${cat} ${round}-${gameNo}`, { setTeam: { side, teamId } });
    hooks.broadcastConfig();
    return json(res, 200, { ok: true }), true;
  }

  // 계정 목록 (참가자·심판·관리자 통합, 마지막 로그인 포함)
  if (url.pathname === '/admin/users' && method === 'GET') {
    const role = url.searchParams.get('role');
    const q = url.searchParams.get('q') ?? undefined;
    const roleFilter: AccountRole | 'staff' | undefined =
      role === 'user' || role === 'judge' || role === 'admin' ? role : role === 'staff' ? 'staff' : undefined;
    const r = listUsers({ role: roleFilter, q });
    return json(res, 200, { ok: true, users: r.users, total: r.total }), true;
  }

  // 모든 계정의 세션을 즉시 폐기 — 침해 의심이나 대회 전에 사용. 본인 포함 전원 재로그인.
  if (url.pathname === '/admin/sessions/revoke-all' && method === 'POST') {
    revokeAllSessions();
    logAudit(session.id, 'reset_password', 'sessions', null, { revokeAll: true });
    return json(res, 200, { ok: true }), true;
  }

  // 심판 담당 테이블 배정 (REF01~REF08 의 고정 규칙과 별개, 추가 심판 지정/변경)
  if (url.pathname === '/admin/accounts/assign' && method === 'POST') {
    const body = (await readJson(req, MAX_ADMIN_BODY_BYTES)) as { id?: unknown; table?: unknown } | null;
    if (typeof body?.id !== 'string') return bad(res), true;
    if (body.table !== null && body.table !== undefined && (!Number.isInteger(body.table) || (body.table as number) < 1 || (body.table as number) > 8)) return bad(res), true;
    if (!assignJudgeTable(body.id, (body.table as number | null | undefined) ?? null)) return json(res, 404, { ok: false, error: 'judge_not_found' }), true;
    logAudit(session.id, 'issue', 'account', body.id, { assignTable: body.table ?? null });
    hooks.broadcastConfig();
    return json(res, 200, { ok: true }), true;
  }

  // 계정 일괄 발급 (관리자가 올린 CSV). 결과의 password 는 평문 한 번만 낸다 → 클라이언트가 CSV 로 저장.
  if (url.pathname === '/admin/accounts/issue' && method === 'POST') {
    const body = (await readJson(req, MAX_ADMIN_BODY_BYTES)) as { accounts?: unknown } | null;
    const accounts = body?.accounts;
    if (!Array.isArray(accounts) || accounts.length === 0 || accounts.length > 500) return bad(res), true;
    for (const a of accounts as { id?: unknown; name?: unknown; role?: unknown; table?: unknown }[]) {
      if (typeof a.id !== 'string' || !/^[a-zA-Z0-9._-]{4,32}$/.test(a.id) || typeof a.name !== 'string' || (a.role !== 'judge' && a.role !== 'admin')) return bad(res), true;
      if (a.table !== undefined && a.table !== null && (!Number.isInteger(a.table) || (a.table as number) < 1 || (a.table as number) > 8)) return bad(res), true;
    }
    try {
      const issued = issueAccounts(
        accounts.map((a) => ({ id: a.id as string, name: a.name as string, role: a.role as 'judge' | 'admin', judgeTable: (a.table as number | null | undefined) ?? null })),
      );
      logAudit(session.id, 'issue', 'account', null, { count: issued.length, ids: issued.map((i) => i.id) });
      return json(res, 200, { ok: true, issued }), true;
    } catch (e) {
      return json(res, 409, { ok: false, error: String((e as Error).message ?? e) }), true;
    }
  }

  // 비밀번호 일괄 재발급. ids 지정 또는 역할(judge/admin) 전체. 결과는 평문 한 번만.
  if (url.pathname === '/admin/accounts/reset-password' && method === 'POST') {
    const body = (await readJson(req, MAX_ADMIN_BODY_BYTES)) as { ids?: unknown; role?: unknown } | null;
    const ids = Array.isArray(body?.ids) ? body.ids.filter((x): x is string => typeof x === 'string') : undefined;
    const role = body?.role === 'judge' || body?.role === 'admin' || body?.role === 'user' ? body.role : undefined;
    if (!ids && !role) return bad(res), true;
    const reset = resetPasswords({ ids, role });
    if (reset.length === 0) return json(res, 404, { ok: false, error: 'no_targets' }), true;
    logAudit(session.id, 'reset_password', 'account', null, { count: reset.length, ids: reset.map((r) => r.id) });
    return json(res, 200, { ok: true, reset }), true;
  }

  if (url.pathname === '/admin/pending' && method === 'GET') {
    const r = getPending();
    return json(res, 200, { ok: true, pending: r.pending, total: r.total }), true;
  }

  // 채점 목록: ?status=pending&cat=J&round=1&judgeId=... (필터 조합, total 은 같은 조건의 전체 수)
  if (url.pathname === '/admin/scores' && method === 'GET') {
    const status = url.searchParams.get('status');
    const cat = url.searchParams.get('cat');
    const round = url.searchParams.get('round');
    const judgeId = url.searchParams.get('judgeId') ?? undefined;
    const r = listScores({
      status: status === 'pending' || status === 'confirmed' || status === 'modified' || status === 'rejected' ? (status as ScoreStatus) : undefined,
      cat: cat === 'J' || cat === 'S' ? cat : undefined,
      round: round === '1' || round === '2' ? (Number(round) as 1 | 2) : undefined,
      judgeId,
    });
    return json(res, 200, { ok: true, scores: r.scores, total: r.total }), true;
  }

  // 채점지 원본(서명 이미지 포함) — 관리자 점수표 PDF 출력용. ?cat=J&round=1 필터.
  if (url.pathname === '/admin/scores/sheets' && method === 'GET') {
    const cat = url.searchParams.get('cat');
    const round = url.searchParams.get('round');
    const sheets = listSheets({
      cat: cat === 'J' || cat === 'S' ? cat : undefined,
      round: round === '1' || round === '2' ? (Number(round) as 1 | 2) : undefined,
    });
    return json(res, 200, { ok: true, sheets }), true;
  }

  // 점수 확정 / 정정 / 반려. 심판은 서명 후 스스로 고칠 수 없고 이 경로를 거친다.
  const scoreAction = url.pathname.match(/^\/admin\/scores\/(confirm|modify|reject)$/);
  if (scoreAction && method === 'POST') {
    const body = (await readJson(req, MAX_ADMIN_BODY_BYTES)) as { matchId?: unknown; teamId?: unknown; judgeId?: unknown; points?: unknown; sheet?: unknown; penCnt?: unknown; reason?: unknown } | null;
    if (!body) return bad(res), true;
    const { matchId, teamId, judgeId } = body;
    if (typeof matchId !== 'string' || typeof teamId !== 'string' || typeof judgeId !== 'string') return bad(res), true;
    let changed: boolean;
    if (scoreAction[1] === 'confirm') {
      changed = confirmScore(matchId, teamId, judgeId, session.id);
    } else if (scoreAction[1] === 'reject') {
      changed = rejectScore(matchId, teamId, judgeId, session.id, typeof body.reason === 'string' ? body.reason : '');
    } else {
      if (body.points !== undefined && (typeof body.points !== 'number' || !Number.isFinite(body.points))) return bad(res), true;
      if (body.penCnt !== undefined && !Number.isInteger(body.penCnt)) return bad(res), true;
      changed = modifyScore(matchId, teamId, judgeId, session.id, {
        points: body.points as number | undefined,
        sheet: body.sheet === undefined ? undefined : body.sheet === null ? null : JSON.stringify(body.sheet),
        penCnt: body.penCnt as number | undefined,
        reason: typeof body.reason === 'string' ? body.reason : undefined,
      });
    }
    if (!changed) return json(res, 409, { ok: false, error: 'not_found_or_bad_status' }), true;
    hooks.onScoresChanged();
    return json(res, 200, { ok: true }), true;
  }

  // 설정 변경: 자동 확정, 순위판 공개, 점수 가리기, 공지, 1·2라운드 심사 점수, 테이블 진행 순서, 순위 조정. 공지·보드 설정은 접속 중인 클라이언트에 즉시 반영한다.
  if (url.pathname === '/admin/settings' && method === 'PUT') {
    const body = (await readJson(req, MAX_ADMIN_BODY_BYTES)) as
      | { autoConfirm?: unknown; boardPublic?: unknown; hideScores?: unknown; notice?: unknown; roundScores?: unknown; tableOrder?: unknown; rankOrder?: unknown }
      | null;
    if (!body) return bad(res), true;
    if (body.autoConfirm !== undefined) {
      if (typeof body.autoConfirm !== 'boolean') return bad(res), true;
      setSetting('auto_confirm', body.autoConfirm ? '1' : '0');
    }
    if (body.boardPublic !== undefined) {
      if (typeof body.boardPublic !== 'boolean') return bad(res), true;
      setSetting('board_public', body.boardPublic ? '1' : '0');
    }
    if (body.hideScores !== undefined) {
      if (typeof body.hideScores !== 'boolean') return bad(res), true;
      setSetting('hide_scores', body.hideScores ? '1' : '0');
    }
    if (body.roundScores !== undefined) {
      if (typeof body.roundScores !== 'object' || body.roundScores === null || Array.isArray(body.roundScores)) return bad(res), true;
      for (const v of Object.values(body.roundScores)) {
        if (typeof v !== 'object' || v === null) return bad(res), true;
        const { r1, r2 } = v as { r1?: unknown; r2?: unknown };
        if ((r1 !== undefined && typeof r1 !== 'string' && typeof r1 !== 'number') || (r2 !== undefined && typeof r2 !== 'string' && typeof r2 !== 'number')) return bad(res), true;
      }
      setSetting('round_scores', JSON.stringify(body.roundScores));
    }
    // 당일 진행 순서: 테이블 1~8 의 실행 순서 (순열)
    if (body.tableOrder !== undefined) {
      if (!Array.isArray(body.tableOrder) || body.tableOrder.length !== 8 || !body.tableOrder.every((n) => Number.isInteger(n) && n >= 1 && n <= 8)) return bad(res), true;
      if (new Set(body.tableOrder as number[]).size !== 8) return bad(res, 'table_order_must_be_permutation'), true;
      setSetting('table_order', JSON.stringify(body.tableOrder));
    }
    // 순위 조정: 부문별 팀 ID 순서. 빈 배열이면 설정을 지워 계산 순위로 되돌린다.
    if (body.rankOrder !== undefined) {
      if (typeof body.rankOrder !== 'object' || body.rankOrder === null || Array.isArray(body.rankOrder)) return bad(res), true;
      const { S, J } = body.rankOrder as { S?: unknown; J?: unknown };
      for (const v of [S, J]) {
        if (v !== undefined && (!Array.isArray(v) || !v.every((x) => typeof x === 'string' && x.length <= 16))) return bad(res), true;
      }
      const clean = { ...(Array.isArray(S) && S.length > 0 ? { S } : {}), ...(Array.isArray(J) && J.length > 0 ? { J } : {}) };
      if (Object.keys(clean).length === 0) {
        deleteSetting('rank_order');
      } else {
        setSetting('rank_order', JSON.stringify(clean));
      }
    }
    if (body.notice !== undefined) {
      if (typeof body.notice !== 'object' || body.notice === null) return bad(res), true;
      const { message, updatedAt } = body.notice as { message?: unknown; updatedAt?: unknown };
      if (typeof message !== 'string') return bad(res), true;
      const notice = { message, updatedAt: typeof updatedAt === 'number' ? updatedAt : Date.now() };
      setSetting('notice', JSON.stringify(notice));
      hooks.emitNotice(notice);
    }
    logAudit(session.id, 'settings', 'settings', null, body);
    hooks.broadcastConfig();
    hooks.emitLeaderboard();
    return json(res, 200, { ok: true }), true;
  }

  // 팀 명단 전체 교체 (관리자 Import). 대진(matches)은 별도 API로 다시 저장해야 한다.
  // 점수가 한 건이라도 있으면 명단 교체를 막는다 — 경기·팀 ID 가 얽힌 데이터가 고아가 된다.
  if (url.pathname === '/admin/teams' && method === 'PUT') {
    const body = (await readJson(req, MAX_ADMIN_BODY_BYTES)) as { teams?: unknown } | null;
    const teams = body?.teams;
    if (!Array.isArray(teams) || teams.length === 0) return bad(res), true;
    const seen = new Set<string>();
    for (const t of teams as { id?: unknown; cat?: unknown; code?: unknown; name?: unknown; members?: unknown }[]) {
      if (typeof t.id !== 'string' || t.id.length > 16 || (t.cat !== 'J' && t.cat !== 'S') ||
        typeof t.code !== 'string' || t.code.length > 32 || typeof t.name !== 'string' || t.name.length > 128 ||
        !Array.isArray(t.members) || t.members.length === 0 || !t.members.every((m) => typeof m === 'string' && m.length <= 32)) return bad(res), true;
      if (seen.has(t.id) || seen.has(t.name)) return bad(res, 'duplicate_in_payload'), true;
      seen.add(t.id);
      seen.add(t.name);
    }
    if (countScores() > 0) return json(res, 409, { ok: false, error: 'scores_exist' }), true;
    try {
      replaceTeams(teams as Parameters<typeof replaceTeams>[0]);
    } catch (e) {
      return json(res, 409, { ok: false, error: (e as Error).message }), true;
    }
    logAudit(session.id, 'teams', 'teams', null, { count: teams.length });
    hooks.broadcastConfig();
    return json(res, 200, { ok: true }), true;
  }

  // 대진·심판 배정 전체 교체. 팀은 명단에 있는 것만 배정할 수 있다.
  if (url.pathname === '/admin/matches' && method === 'PUT') {
    const body = (await readJson(req, MAX_ADMIN_BODY_BYTES)) as { matches?: unknown } | null;
    const matches = body?.matches;
    if (!Array.isArray(matches) || matches.length === 0) return bad(res), true;
    for (const m of matches as { id?: unknown; round?: unknown; cat?: unknown; wave?: unknown; table?: unknown; field?: unknown; team?: unknown }[]) {
      if (typeof m.id !== 'string' || (m.round !== 1 && m.round !== 2) || (m.cat !== 'J' && m.cat !== 'S') ||
        (m.wave !== 'A' && m.wave !== 'B') || !Number.isInteger(m.table) || (m.table as number) < 1 || (m.table as number) > 8 ||
        (m.field !== '좌' && m.field !== '우') || typeof m.team !== 'string') return bad(res), true;
    }
    try {
      replaceMatches(matches as Parameters<typeof replaceMatches>[0]);
    } catch (e) {
      return json(res, 409, { ok: false, error: (e as Error).message }), true;
    }
    logAudit(session.id, 'matches', 'matches', null, { count: matches.length });
    hooks.broadcastConfig();
    return json(res, 200, { ok: true }), true;
  }

  return json(res, 404, { ok: false, error: 'not_found' }), true;
}
