import {
  autoConfirm,
  boardPublic,
  confirmScore,
  countScores,
  deleteHomologation,
  deleteSetting,
  getActivity,
  getHomologation,
  getBroadcastUrl,
  getNotice,
  getOverview,
  getPending,
  getProgress,
  getRankOrder,
  getTournamentSubmission,
  getTableOrder,
  getTemplate,
  hideScores,
  issueAccounts,
  listHomologations,
  listScores,
  listTeams,
  listSheets,
  listUsers,
  logAudit,
  modifyScore,
  rejectScore,
  replaceMatches,
  replaceTeams,
  resetPasswords,
  resetTemplate,
  ROBOT_CHECKS,
  MAX_ROBOTS,
  saveHomologation,
  revokeAllSessions,
  forceTournamentScore,
  getTournament,
  resetTournamentGame,
  saveTournamentResult,
  saveTournamentSlots,
  setSetting,
  setTemplate,
  setTournamentTeam,
  type AccountRole,
  type HomologationData,
  type ScoreStatus,
  type TournamentRound,
} from '../db.ts';
import { Router, body, query, requireRole, requireSession, type Guard } from '../router.ts';
import { json } from '../http.ts';
import {
  arr,
  bool,
  jsonObj,
  nullable,
  num,
  obj,
  oneOf,
  opt,
  qNum,
  qOpt,
  rec,
  str,
  strOrNum,
} from '../validate.ts';

// --- 관리자 API (role=admin 전용) ---

// 팀 명단 Import 등 관리자 JSON 본문 상한
const MAX_ADMIN_BODY_BYTES = 1024 * 1024;

export type AdminHooks = {
  broadcastConfig: () => void;
  emitLeaderboard: () => void;
  emitNotice: (notice: { message: string; updatedAt: number }) => void;
  onScoresChanged: () => void;
};

// 비밀번호를 바꾸지 않은 재발급 계정은 관리 작업을 못 한다 (조회는 허용 — /password 유도에 필요).
const blockMustChange: Guard = (ctx) => {
  const readOnly = ctx.url.pathname === '/admin/settings' && ctx.method === 'GET';
  if (ctx.session!.mc && !readOnly) {
    json(ctx.res, 403, { ok: false, error: 'password_change_required' });
    return false;
  }
  return true;
};

const cat = oneOf('J', 'S');
const tableNo = num({ int: true, min: 1, max: 8 });
const tournamentRound = oneOf('QF', 'SF', 'F', '3P');

const templateItem = obj({
  id: str(),
  label: str(),
  m: oneOf('M1', 'M2', 'PEN'),
  type: oneOf('count', 'bool', 'auto', 'manual'),
  pj: num(),
  ps: num(),
  max: opt(num({ int: true })),
});

const tournamentResultBody = obj({
  cat,
  round: tournamentRound,
  gameNo: num({ int: true }),
  winner: opt(oneOf('A', 'B')),
});

const tournamentModifyBody = obj({
  cat,
  round: tournamentRound,
  gameNo: num({ int: true }),
  scoreA: num({ min: 0, max: 9999 }),
  scoreB: num({ min: 0, max: 9999 }),
  winner: opt(oneOf('A', 'B')),
  reason: str({ min: 1, max: 500 }),
});

const tournamentResetBody = obj({
  cat,
  round: tournamentRound,
  gameNo: num({ int: true }),
});

const accountsIssueBody = obj({
  accounts: arr(
    obj({
      id: str({ min: 4, max: 32, re: /^[a-zA-Z0-9._-]{4,32}$/ }),
      name: str(),
      role: oneOf('judge', 'admin'),
    }),
    { min: 1, max: 500 },
  ),
});

const settingsBody = obj({
  autoConfirm: opt(bool),
  boardPublic: opt(bool),
  hideScores: opt(bool),
  notice: opt(obj({ message: str(), updatedAt: opt(num()) })),
  // 경기 중계 주소: http(s) 주소만 받는다 (iframe src 로 쓰이므로 javascript: 등 차단). 빈 문자열이면 지운다.
  broadcastUrl: opt(str({ max: 2048, re: /^(|https?:\/\/\S+)$/i })),
  // 구버전 클라이언트가 수동 점수를 보내더라도 묵시하지 않고 명시적으로 거부한다.
  roundScores: opt(rec(obj({ r1: opt(strOrNum), r2: opt(strOrNum) }))),
  tableOrder: opt(arr(tableNo, { min: 8, max: 8 })),
  rankOrder: opt(obj({ S: opt(arr(str({ max: 16 }))), J: opt(arr(str({ max: 16 }))) })),
});

const teamImportBody = obj({
  teams: arr(
    obj({
      id: str({ max: 16 }),
      cat,
      code: str({ max: 32 }),
      name: str({ max: 128 }),
      members: arr(str({ max: 32 }), { min: 1 }),
    }),
    { min: 1 },
  ),
});

const matchImportBody = obj({
  matches: arr(
    obj({
      id: str(),
      round: oneOf(1, 2),
      cat,
      wave: oneOf('A', 'B'),
      table: tableNo,
      field: oneOf('좌', '우'),
      team: str(),
    }),
    // 최소 건수 없음: 조 추첨 '비우기'로 모든 배정을 지울 수 있어야 한다
  ),
});

// 로봇 승인서. 서명은 캔버스 PNG(data URL) — 한 장에 수십 KB 라 넉넉히 잡는다.
const signature = str({ min: 32, max: 400_000, re: /^data:image\/png;base64,[A-Za-z0-9+/=]+$/ }); // 심판·팀 대표 서명은 필수
const robotChecks = arr(bool, { max: MAX_ROBOTS });
const homologationBody = obj({
  robots: num({ int: true, min: 1, max: MAX_ROBOTS }),
  judge: str({ max: 64 }),
  decoration: nullable(oneOf('yes', 'no')),
  checks: obj(Object.fromEntries(ROBOT_CHECKS.map((k) => [k, robotChecks])) as Record<(typeof ROBOT_CHECKS)[number], typeof robotChecks>),
  judgeSig: signature,
  teamSig: signature,
});

export function createAdminRoutes(hooks: AdminHooks): Router {
  const r = new Router('/admin');
  r.use(requireSession, requireRole('admin'), blockMustChange);

  r.get('/activity', query({ limit: qOpt(qNum({ int: true, min: 1 })) }), (ctx) => {
    const { limit } = ctx.query as { limit?: number };
    json(ctx.res, 200, { ok: true, activity: getActivity(limit ?? 50) });
  });

  // 대시보드 집계
  r.get('/overview', (ctx) => {
    json(ctx.res, 200, { ok: true, overview: getOverview() });
  });

  // 설정 조회 (관리자 전용 값 포함: 점수 가리기, 테이블 진행 순서, 순위 조정)
  r.get('/settings', (ctx) => {
    json(ctx.res, 200, {
      ok: true,
      settings: {
        autoConfirm: autoConfirm(),
        boardPublic: boardPublic(),
        hideScores: hideScores(),
        notice: getNotice(),
        broadcastUrl: getBroadcastUrl(),
        tableOrder: getTableOrder(),
        rankOrder: getRankOrder(),
      },
    });
  });

  // 채점표 템플릿: 저장된 값(null 이면 rules.ts 기본값)과 저장·복원
  r.get('/template', (ctx) => {
    json(ctx.res, 200, { ok: true, template: getTemplate() });
  });
  r.put('/template', body(obj({ items: arr(templateItem, { min: 1 }) }), MAX_ADMIN_BODY_BYTES), (ctx) => {
    const { items } = ctx.body as { items: unknown[] };
    setTemplate(items);
    logAudit(ctx.session!.id, 'template', 'template', null, { count: items.length });
    hooks.broadcastConfig();
    json(ctx.res, 200, { ok: true });
  });
  r.post('/template/reset', (ctx) => {
    resetTemplate();
    logAudit(ctx.session!.id, 'template', 'template', null, { reset: true });
    hooks.broadcastConfig();
    json(ctx.res, 200, { ok: true });
  });

  // 토너먼트 8슬롯 배정 저장 → /contest 대진표에 즉시 반영 (config 브로드캐스트)
  r.put('/tournament/slots', body(obj({ cat, teamIds: arr(nullable(str({ max: 16 })), { min: 8, max: 8 }) }), MAX_ADMIN_BODY_BYTES), (ctx) => {
    const { cat: c, teamIds } = ctx.body as { cat: 'J' | 'S'; teamIds: (string | null)[] };
    // 예선(1·2차)이 모두 확정되기 전에는 8강 배정을 저장할 수 없다 (전부 비우는 초기화는 허용)
    if (teamIds.some((t) => t !== null) && !getProgress()[c].tournamentOpen) {
      return void json(ctx.res, 409, { ok: false, error: '예선(1·2차) 점수가 모두 확정된 뒤에 8강을 배정할 수 있습니다.' });
    }
    saveTournamentSlots(c, teamIds);
    logAudit(ctx.session!.id, 'tournament', 'tournament', c, { slots: teamIds.filter(Boolean).length });
    hooks.broadcastConfig();
    json(ctx.res, 200, { ok: true });
  });

  // 토너먼트 경기 결과 저장. 승자가 다음 라운드로 진출하고, 준결승 패자는 3·4위전으로 간다.
  // 동점이면 winner(A|B) 가 있어야 한다. 같은 경기를 다시 저장하면 하위 라운드까지 다시 계산된다.
  r.post('/tournament/result', body(tournamentResultBody, MAX_ADMIN_BODY_BYTES), (ctx) => {
    const { cat: c, round, gameNo, winner } = ctx.body as ReturnType<typeof tournamentResultBody>;
    const submission = getTournamentSubmission(c, round as TournamentRound, gameNo);
    if (!submission) return void json(ctx.res, 409, { ok: false, error: '심판이 제출한 점수가 없습니다.' });
    const { scoreA, scoreB } = submission;
    // 동점은 관리자가 승자를 골라야 확정된다 (승자 없이는 저장해도 경기가 정해지지 않으므로 성공으로 응답하지 않는다)
    if (scoreA === scoreB && !winner) return void json(ctx.res, 409, { ok: false, error: '동점입니다. 올라갈 팀(승자)을 선택해야 확정할 수 있습니다.' });
    try {
      saveTournamentResult(c, round as TournamentRound, gameNo, scoreA, scoreB, winner);
    } catch (e) {
      return void json(ctx.res, 400, { ok: false, error: (e as Error).message });
    }
    logAudit(ctx.session!.id, 'tournament', 'tournament', `${c} ${round}-${gameNo}`, { scoreA, scoreB, winner });
    hooks.broadcastConfig();
    json(ctx.res, 200, { ok: true });
  });

  // 강제 수정: 확정된 경기(또는 아직 확정 전인 경기)의 점수를 관리자가 직접 고쳐 확정한다. 동점이면 승자를 골라야 한다.
  // 승자가 바뀌면 그 승자·패자가 이미 올라간 뒤 라운드 결과는 지워진다. 심판 제출 점수도 같은 값으로 맞춘다.
  r.post('/tournament/modify', body(tournamentModifyBody, MAX_ADMIN_BODY_BYTES), (ctx) => {
    const { cat: c, round, gameNo, scoreA, scoreB, winner, reason } = ctx.body as ReturnType<typeof tournamentModifyBody>;
    if (!reason.trim()) return void json(ctx.res, 400, { ok: false, error: '수정 사유를 입력해 주세요.' });
    if (scoreA === scoreB && !winner) return void json(ctx.res, 409, { ok: false, error: '동점입니다. 올라갈 팀(승자)을 선택해야 합니다.' });
    const prev = getTournament().games.find((g) => g.cat === c && g.round === round && g.gameNo === gameNo);
    if (!prev) return void json(ctx.res, 404, { ok: false, error: 'game_not_found' });
    if (!prev.teamA || !prev.teamB) return void json(ctx.res, 409, { ok: false, error: '아직 두 팀이 정해지지 않은 경기입니다.' });
    try {
      forceTournamentScore(c, round as TournamentRound, gameNo, scoreA, scoreB, winner, ctx.session!.id);
    } catch (e) {
      return void json(ctx.res, 400, { ok: false, error: (e as Error).message });
    }
    logAudit(ctx.session!.id, 'modify', 'tournament', `${c} ${round}-${gameNo}`, { prev: { scoreA: prev.scoreA, scoreB: prev.scoreB, winner: prev.winner, status: prev.status }, scoreA, scoreB, winner, reason: reason.trim() });
    hooks.broadcastConfig();
    json(ctx.res, 200, { ok: true });
  });

  // 재채점: 경기 결과·제출·팀별 채점지를 지워 심판이 다시 채점하게 한다. 뒤 라운드에 이미 반영된 결과도 함께 지운다.
  r.post('/tournament/reset-game', body(tournamentResetBody, MAX_ADMIN_BODY_BYTES), (ctx) => {
    const { cat: c, round, gameNo } = ctx.body as ReturnType<typeof tournamentResetBody>;
    try {
      if (!resetTournamentGame(c, round as TournamentRound, gameNo)) return void json(ctx.res, 404, { ok: false, error: 'game_not_found' });
    } catch (e) {
      return void json(ctx.res, 400, { ok: false, error: (e as Error).message });
    }
    logAudit(ctx.session!.id, 'tournament', 'tournament', `${c} ${round}-${gameNo}`, { reset: true });
    hooks.broadcastConfig();
    json(ctx.res, 200, { ok: true });
  });

  // 준결승 이후 슬롯에 팀을 직접 지정 (기권·부전승 등). 빈 칸(null)으로 비울 수도 있다.
  // 해당 경기 결과는 지워지고, 상위 라운드 결과를 다시 저장하면 자동 배정으로 덮인다.
  r.post(
    '/tournament/set-team',
    body(obj({ cat, round: oneOf('SF', 'F', '3P'), gameNo: num({ int: true }), side: oneOf('A', 'B'), teamId: nullable(str({ max: 16 })) }), MAX_ADMIN_BODY_BYTES),
    (ctx) => {
      const { cat: c, round, gameNo, side, teamId } = ctx.body as { cat: 'J' | 'S'; round: TournamentRound; gameNo: number; side: 'A' | 'B'; teamId: string | null };
      try {
        if (!setTournamentTeam(c, round, gameNo, side, teamId)) return void json(ctx.res, 404, { ok: false, error: 'game_not_found' });
      } catch (e) {
        return void json(ctx.res, 409, { ok: false, error: (e as Error).message });
      }
      logAudit(ctx.session!.id, 'tournament', 'tournament', `${c} ${round}-${gameNo}`, { setTeam: { side, teamId } });
      hooks.broadcastConfig();
      json(ctx.res, 200, { ok: true });
    },
  );

  // 계정 목록 (참가자·심판·관리자 통합, 마지막 로그인 포함)
  r.get('/users', query({ role: qOpt(oneOf('user', 'judge', 'admin', 'staff')), q: qOpt(str()) }), (ctx) => {
    const { role: roleParam, q } = ctx.query as { role?: AccountRole | 'staff'; q?: string };
    const result = listUsers({ role: roleParam, q });
    json(ctx.res, 200, { ok: true, users: result.users, total: result.total });
  });

  // 모든 계정의 세션을 즉시 폐기 — 침해 의심이나 대회 전에 사용. 본인 포함 전원 재로그인.
  r.post('/sessions/revoke-all', (ctx) => {
    revokeAllSessions();
    logAudit(ctx.session!.id, 'reset_password', 'sessions', null, { revokeAll: true });
    json(ctx.res, 200, { ok: true });
  });

  // 계정 일괄 발급 (관리자가 올린 CSV). 결과의 password 는 평문 한 번만 낸다 → 클라이언트가 CSV 로 저장.
  r.post('/accounts/issue', body(accountsIssueBody, MAX_ADMIN_BODY_BYTES), (ctx) => {
    const { accounts } = ctx.body as { accounts: { id: string; name: string; role: 'judge' | 'admin' }[] };
    try {
      const issued = issueAccounts(accounts.map((a) => ({ id: a.id, name: a.name, role: a.role })));
      logAudit(ctx.session!.id, 'issue', 'account', null, { count: issued.length, ids: issued.map((i) => i.id) });
      json(ctx.res, 200, { ok: true, issued });
    } catch (e) {
      json(ctx.res, 409, { ok: false, error: String((e as Error).message ?? e) });
    }
  });

  // 비밀번호 일괄 재발급. ids 지정 또는 역할(judge/admin) 전체. 결과는 평문 한 번만.
  r.post('/accounts/reset-password', body(obj({ ids: opt(arr(str())), role: opt(oneOf('judge', 'admin', 'user')) }), MAX_ADMIN_BODY_BYTES), (ctx) => {
    const { ids, role } = ctx.body as { ids?: string[]; role?: 'judge' | 'admin' | 'user' };
    if (!ids && !role) return void json(ctx.res, 400, { ok: false, error: 'invalid' });
    const reset = resetPasswords({ ids, role });
    if (reset.length === 0) return void json(ctx.res, 404, { ok: false, error: 'no_targets' });
    logAudit(ctx.session!.id, 'reset_password', 'account', null, { count: reset.length, ids: reset.map((x) => x.id) });
    json(ctx.res, 200, { ok: true, reset });
  });

  r.get('/pending', (ctx) => {
    const result = getPending();
    json(ctx.res, 200, { ok: true, pending: result.pending, total: result.total });
  });

  // 채점 목록: ?status=pending&cat=J&round=1&judgeId=... (필터 조합, total 은 같은 조건의 전체 수)
  r.get(
    '/scores',
    query({ status: qOpt(oneOf('pending', 'confirmed', 'modified', 'rejected')), cat: qOpt(oneOf('J', 'S')), round: qOpt(oneOf('1', '2')), judgeId: qOpt(str()) }),
    (ctx) => {
      const { status, cat: c, round, judgeId } = ctx.query as { status?: ScoreStatus; cat?: 'J' | 'S'; round?: '1' | '2'; judgeId?: string };
      const result = listScores({
        status,
        cat: c,
        round: round ? (Number(round) as 1 | 2) : undefined,
        judgeId,
      });
      json(ctx.res, 200, { ok: true, scores: result.scores, total: result.total });
    },
  );

  // 채점지 원본(서명 이미지 포함) — 관리자 점수표 PDF 출력용. ?cat=J&round=1 필터, matchId·teamId·judgeId 로 한 건만 조회.
  r.get(
    '/scores/sheets',
    query({ cat: qOpt(oneOf('J', 'S')), round: qOpt(oneOf('1', '2')), matchId: qOpt(str()), teamId: qOpt(str()), judgeId: qOpt(str()) }),
    (ctx) => {
    const { cat: c, round, matchId, teamId, judgeId } = ctx.query as { cat?: 'J' | 'S'; round?: '1' | '2'; matchId?: string; teamId?: string; judgeId?: string };
    const sheets = listSheets({
      cat: c,
      round: round ? (Number(round) as 1 | 2) : undefined,
      matchId,
      teamId,
      judgeId,
    });
    json(ctx.res, 200, { ok: true, sheets });
    },
  );

  // 점수 확정 / 반려 / 강제 정정. 강제 정정은 원본 채점지를 보존하고 감사 로그에 사유를 남긴다.
  const scoreActionGuard: Guard = (ctx) => {
    if (ctx.params.action !== 'confirm' && ctx.params.action !== 'reject' && ctx.params.action !== 'modify') {
      json(ctx.res, 404, { ok: false, error: 'not_found' });
      return false;
    }
    return true;
  };
  r.post(
    '/scores/:action',
    scoreActionGuard,
    body(
      obj({
        matchId: str(),
        teamId: str(),
        judgeId: str(),
        points: opt(num()),
        penCnt: opt(num({ int: true })),
        reason: opt(str({ max: 500 })),
        sheet: opt(nullable(jsonObj)),
      }),
      MAX_ADMIN_BODY_BYTES,
    ),
    (ctx) => {
      const b = ctx.body as { matchId: string; teamId: string; judgeId: string; points?: number; penCnt?: number; reason?: string; sheet?: Record<string, unknown> | null };
      const { matchId, teamId, judgeId } = b;
      const s = ctx.session!;
      let changed: boolean;
      if (ctx.params.action === 'confirm') {
        changed = confirmScore(matchId, teamId, judgeId, s.id);
      } else if (ctx.params.action === 'reject') {
        changed = rejectScore(matchId, teamId, judgeId, s.id, b.reason ?? '');
      } else {
        if (b.points === undefined) return void json(ctx.res, 400, { ok: false, error: 'points_required' });
        if (!b.reason?.trim()) return void json(ctx.res, 400, { ok: false, error: 'reason_required' });
        changed = modifyScore(matchId, teamId, judgeId, s.id, { points: b.points, reason: b.reason.trim() });
      }
      if (!changed) return void json(ctx.res, 409, { ok: false, error: 'not_found_or_bad_status' });
      hooks.onScoresChanged();
      json(ctx.res, 200, { ok: true });
    },
  );

  // 설정 변경: 자동 확정, 순위판 공개, 점수 가리기, 공지, 테이블 진행 순서, 순위 조정. 공지·보드 설정은 접속 중인 클라이언트에 즉시 반영한다.
  r.put('/settings', body(settingsBody, MAX_ADMIN_BODY_BYTES), (ctx) => {
    const b = ctx.body as ReturnType<typeof settingsBody>;
    if (b.roundScores !== undefined) return void json(ctx.res, 403, { ok: false, error: 'score_input_forbidden' });
    if (b.autoConfirm !== undefined) setSetting('auto_confirm', b.autoConfirm ? '1' : '0');
    if (b.boardPublic !== undefined) setSetting('board_public', b.boardPublic ? '1' : '0');
    if (b.hideScores !== undefined) setSetting('hide_scores', b.hideScores ? '1' : '0');
    if (b.broadcastUrl !== undefined) {
      const url = b.broadcastUrl.trim();
      if (url) setSetting('broadcast_url', JSON.stringify(url));
      else deleteSetting('broadcast_url');
    }
    // 당일 진행 순서: 테이블 1~8 의 실행 순서 (순열)
    if (b.tableOrder !== undefined) {
      if (new Set(b.tableOrder).size !== 8) return void json(ctx.res, 400, { ok: false, error: 'table_order_must_be_permutation' });
      setSetting('table_order', JSON.stringify(b.tableOrder));
    }
    // 순위 조정: 부문별 팀 ID 순서. 빈 배열이면 설정을 지워 계산 순위로 되돌린다.
    if (b.rankOrder !== undefined) {
      const clean = {
        ...(b.rankOrder.S && b.rankOrder.S.length > 0 ? { S: b.rankOrder.S } : {}),
        ...(b.rankOrder.J && b.rankOrder.J.length > 0 ? { J: b.rankOrder.J } : {}),
      };
      if (Object.keys(clean).length === 0) deleteSetting('rank_order');
      else setSetting('rank_order', JSON.stringify(clean));
    }
    if (b.notice !== undefined) {
      const notice = { message: b.notice.message, updatedAt: b.notice.updatedAt ?? Date.now() };
      setSetting('notice', JSON.stringify(notice));
      hooks.emitNotice(notice);
    }
    logAudit(ctx.session!.id, 'settings', 'settings', null, b);
    hooks.broadcastConfig();
    hooks.emitLeaderboard();
    json(ctx.res, 200, { ok: true });
  });

  // 팀 명단 전체 교체 (관리자 Import). 대진(matches)은 별도 API로 다시 저장해야 한다.
  // 점수가 한 건이라도 있으면 명단 교체를 막는다 — 경기·팀 ID 가 얽힌 데이터가 고아가 된다.
  r.put('/teams', body(teamImportBody, MAX_ADMIN_BODY_BYTES), (ctx) => {
    const { teams } = ctx.body as { teams: { id: string; cat: 'J' | 'S'; code: string; name: string; members: string[]; region?: string; org?: string; coach?: string }[] };
    const seen = new Set<string>();
    for (const t of teams) {
      if (seen.has(t.id) || seen.has(t.name)) return void json(ctx.res, 400, { ok: false, error: 'duplicate_in_payload' });
      seen.add(t.id);
      seen.add(t.name);
    }
    if (countScores() > 0) return void json(ctx.res, 409, { ok: false, error: 'scores_exist' });
    try {
      replaceTeams(teams as Parameters<typeof replaceTeams>[0]);
    } catch (e) {
      return void json(ctx.res, 409, { ok: false, error: (e as Error).message });
    }
    logAudit(ctx.session!.id, 'teams', 'teams', null, { count: teams.length });
    hooks.broadcastConfig();
    json(ctx.res, 200, { ok: true });
  });

  // 로봇 승인서: 목록(서명 제외) · 한 장 조회(서명 포함) · 저장 · 삭제.
  // 저장·삭제하면 팀 이름 옆 승인 표시가 바뀌므로 config 를 브로드캐스트한다.
  r.get('/homologations', (ctx) => {
    json(ctx.res, 200, { ok: true, homologations: listHomologations() });
  });
  r.get('/homologations/:teamId', (ctx) => {
    json(ctx.res, 200, { ok: true, homologation: getHomologation(ctx.params.teamId) });
  });
  r.put('/homologations/:teamId', body(homologationBody, MAX_ADMIN_BODY_BYTES, { nullStatus: 413 }), (ctx) => {
    const { teamId } = ctx.params;
    if (!listTeams().some((t) => t.id === teamId)) return void json(ctx.res, 404, { ok: false, error: '팀을 찾을 수 없습니다.' });
    const data = ctx.body as HomologationData;
    if (!data.judge.trim()) return void json(ctx.res, 400, { ok: false, error: '심판 이름을 입력하세요.' });
    const saved = saveHomologation(teamId, data, ctx.session!.id);
    logAudit(ctx.session!.id, 'homologation', 'homologation', teamId, { robots: saved.robots, status: saved.status });
    hooks.broadcastConfig();
    json(ctx.res, 200, { ok: true, homologation: saved });
  });
  r.post('/homologations/:teamId/delete', (ctx) => {
    if (!deleteHomologation(ctx.params.teamId)) return void json(ctx.res, 404, { ok: false, error: 'not_found' });
    logAudit(ctx.session!.id, 'homologation', 'homologation', ctx.params.teamId, { deleted: true });
    hooks.broadcastConfig();
    json(ctx.res, 200, { ok: true });
  });

  // 대진·심판 배정 전체 교체. 팀은 명단에 있는 것만 배정할 수 있다.
  r.put('/matches', body(matchImportBody, MAX_ADMIN_BODY_BYTES), (ctx) => {
    const { matches } = ctx.body as { matches: Parameters<typeof replaceMatches>[0] };
    try {
      replaceMatches(matches);
    } catch (e) {
      return void json(ctx.res, 409, { ok: false, error: (e as Error).message });
    }
    logAudit(ctx.session!.id, 'matches', 'matches', null, { count: matches.length });
    hooks.broadcastConfig();
    json(ctx.res, 200, { ok: true });
  });

  return r;
}
