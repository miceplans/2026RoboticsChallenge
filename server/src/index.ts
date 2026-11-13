import { createServer } from 'node:http';
import { Server } from 'socket.io';
import {
  autoConfirm,
  assignJudgeTable,
  boardPublic,
  bootstrapStaffIfNone,
  seedDefaultAccounts,
  confirmScore,
  countScores,
  deleteSetting,
  getActivity,
  getConfigVersion,
  getJudgeTables,
  getMatch,
  getNotice,
  getOverview,
  getPending,
  getRoundScores,
  getStandings,
  getTableOrder,
  getRankOrder,
  getTeamScores,
  getTemplate,
  getTournament,
  hideScores,
  issueAccounts,
  judgeTableOf,
  listMatches,
  listScores,
  listTeams,
  listUsers,
  logAudit,
  modifyScore,
  rejectScore,
  replaceMatches,
  replaceTeams,
  resetPasswords,
  resetTemplate,
  revokeAllSessions,
  saveScore,
  saveTournamentResult,
  saveTournamentSlots,
  seedIfEmpty,
  setSetting,
  setTemplate,
  setTournamentTeam,
  type AccountRole,
  type ScoreStatus,
  type TournamentRound,
} from './db.ts';
import { sessionFromCookie, type Session } from './session.ts';

if (process.env.NODE_ENV === 'production' && !process.env.AUTH_SECRET) {
  throw new Error('운영 환경에서는 AUTH_SECRET 을 반드시 설정해야 합니다 (기본값은 개발 전용).');
}

const PORT = Number(process.env.PORT ?? 4000);
// 쉼표로 여러 개: https://example.com,https://judge.example.com
const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://judge.localhost:3000,http://admin.localhost:3000').split(',');
const BROADCAST_MS = 500;

type SubmitPayload = { matchId: unknown; teamId: unknown; points: unknown; ts: unknown; sheet?: unknown; penCnt?: unknown };
type Result = { ok: true } | { ok: false; error: string };
type TeamScoresResult = { ok: true; scores: ReturnType<typeof getTeamScores> } | { ok: false; error: string };

// 채점지(서명 이미지 포함) 상한. 초과분은 거부한다.
const MAX_SHEET_BYTES = 400 * 1024;
const MAX_BODY_BYTES = MAX_SHEET_BYTES + 4096;
// 팀 명단 Import 등 관리자 JSON 본문 상한
const MAX_ADMIN_BODY_BYTES = 1024 * 1024;

seedIfEmpty();
seedDefaultAccounts(); // 없는 기본 계정만 만든다 (팀별·관리자 2·심판 16)
bootstrapStaffIfNone();

// 대회 서버 — 예외 하나로 프로세스가 날아가면 모든 심판 제출이 끊긴다.
// 정상 경로는 각 핸들러가 잡고, 여기는 마지막 방어선으로 로그만 남겨 프로세스를 살린다.
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e));
process.on('uncaughtException', (e) => console.error('uncaughtException:', e));

// 소켓/HTTP 공통. 클라이언트는 확인(ok)을 받을 때까지 같은 payload 를 재전송핸도 안전하다 (upsert + ts 비교).
// 제출은 실제 대진과 대조해 검증한다: 존재하는 경기인지, 팀이 그 경기 팀인지, 심판 담당 테이블이 맞는지.
// ts 는 미래로 5분 이상 틀어진 것을 거부한다 — 심판 기기 시계가 미래로 가면 이후 정상 제출이 전부 무시되는 것을 막는다.
function submitScore(session: Session, p: SubmitPayload | undefined): Result {
  if (session.role !== 'judge' && session.role !== 'admin') return { ok: false, error: 'forbidden' };

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
  if (session.role === 'judge') {
    const table = judgeTableOf(session.id);
    if (table !== null && match.table !== table) return { ok: false, error: 'not_your_table' };
  }

  // judgeId 는 클라이언트가 본낸 값이 아니라 세션에서만 가져온다
  saveScore({ matchId, teamId, judgeId: session.id, points, ts, sheet: sheetJson, penCnt });
  scheduleBroadcast();
  return { ok: true };
}

const json = (res: import('node:http').ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
};

// 한도를 넘어도 연결을 끊지 않고 끝까지 읽어 버린 뒤 413 으로 답한다.
// 길이는 바이트로 재고, 30초가 넘으면 끊는다 — 느린 전송으로 워커를 붙잡는 공격을 막는다.
function readBody(req: import('node:http').IncomingMessage, limit: number): Promise<string | null> {
  return new Promise((resolve) => {
    let body = '';
    let bytes = 0;
    let tooLarge = false;
    let done = false;
    const finish = (v: string | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), 30_000);
    req.on('data', (chunk) => {
      if (tooLarge) return;
      body += chunk;
      bytes += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
      if (bytes > limit) {
        tooLarge = true;
        body = '';
      }
    });
    req.on('end', () => finish(tooLarge ? null : body));
    req.on('close', () => finish(null));
  });
}

// JSON 본문만 받는다 — content-type 검증으로 폼/스크립트 기반 CSRF 를 한 줄 더 막는다.
const readJson = async (req: import('node:http').IncomingMessage, limit: number): Promise<unknown | null> => {
  if (!(req.headers['content-type'] ?? '').includes('application/json')) return null;
  const body = await readBody(req, limit);
  if (body === null) return null;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
};

const bad = (res: import('node:http').ServerResponse, error = 'invalid') => json(res, 400, { ok: false, error });

// WebSocket 이 막히거나 불안정할 때 클라이언트가 쓰는 평번: POST /score
const httpServer = createServer(async (req, res) => {
  try {
    await handleRequest(req, res);
  } catch (e) {
    // 예외로 인해 연결이 끊기거나 프로세스가 죽지 않게 500 으로 답한다 (상세는 서버 로그)
    console.error('요청 처리 실패:', e);
    if (!res.headersSent) json(res, 500, { ok: false, error: 'internal' });
    else res.end();
  }
});

async function handleRequest(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse): Promise<void> {
  const origin = req.headers.origin;
  if (origin && origins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Vary', 'Origin');
  }
  const method = req.method ?? 'GET';
  // 브라우저 preflight 는 어떤 경로에서든 204 로 받는다
  if (method === 'OPTIONS') return void res.writeHead(204).end();
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/health') return void res.end('ok');

  const session = sessionFromCookie(req.headers.cookie);

  // --- 인증 필요 조회 API ---

  // 대회 전체 설정(공개분)·채점표 템플릿·팀·대진·토너먼트를 한 번에. 클라이언트는 updatedAt 으로 캐시를 비교한다.
  // 팀 명단은 역할별로 최소화한다 — 참가자에게 다른 팀의 지역·소속·코치·참가자 명단(미성년자 정보)을 내주지 않는다.
  if (url.pathname === '/config' && method === 'GET') {
    if (!session) return json(res, 401, { ok: false, error: 'unauthorized' });
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
      },
    });
  }

  // 순위판 스냅샷. 소켓 끊김 시 재검증용. 보드 비공개 설정을 반영한다.
  if (url.pathname === '/standings' && method === 'GET') {
    if (!session) return json(res, 401, { ok: false, error: 'unauthorized' });
    const visible = boardPublic() || session.role === 'admin';
    return json(res, 200, { ok: true, standings: visible ? getStandings() : [] });
  }

  // 팀 채점 표: 참가자는 자기 팀만, 심판/관리자는 모든 팀을 조회할 수 있다.
  // '점수 가리기' 설정이 켜져 있으면 참가자 조회를 막는다.
  if (url.pathname === '/team-scores' && method === 'GET') {
    if (!session) return json(res, 401, { ok: false, error: 'unauthorized' });
    const teamId = url.searchParams.get('teamId') ?? '';
    if (!teamId || teamId.length > 64) return bad(res);
    if (session.role === 'user' && (session.teamId !== teamId || hideScores())) return json(res, 403, { ok: false, error: 'forbidden' });
    const body: TeamScoresResult = { ok: true, scores: getTeamScores(teamId) };
    return json(res, 200, body);
  }

  // --- 관리자 API (role=admin 전용) ---

  if (url.pathname.startsWith('/admin/')) {
    if (!session) return json(res, 401, { ok: false, error: 'unauthorized' });
    if (session.role !== 'admin') return json(res, 403, { ok: false, error: 'forbidden' });

    if (url.pathname === '/admin/activity' && method === 'GET') {
      const limit = Number(url.searchParams.get('limit') ?? 50);
      return json(res, 200, { ok: true, activity: getActivity(Number.isInteger(limit) && limit > 0 ? limit : 50) });
    }

    // 대시보드 집계
    if (url.pathname === '/admin/overview' && method === 'GET') {
      return json(res, 200, { ok: true, overview: getOverview() });
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
      });
    }

    // 채점표 템플릿: 저장된 값(null 이면 rules.ts 기본값)과 저장·복원
    if (url.pathname === '/admin/template' && method === 'GET') {
      return json(res, 200, { ok: true, template: getTemplate() });
    }
    if (url.pathname === '/admin/template' && method === 'PUT') {
      const body = (await readJson(req, MAX_ADMIN_BODY_BYTES)) as { items?: unknown } | null;
      const items = body?.items;
      if (!Array.isArray(items) || items.length === 0) return bad(res);
      for (const it of items as { id?: unknown; m?: unknown; label?: unknown; type?: unknown; pj?: unknown; ps?: unknown; max?: unknown }[]) {
        if (typeof it.id !== 'string' || typeof it.label !== 'string') return bad(res);
        if (it.m !== 'M1' && it.m !== 'M2' && it.m !== 'PEN') return bad(res);
        if (it.type !== 'count' && it.type !== 'bool' && it.type !== 'auto' && it.type !== 'manual') return bad(res);
        if (typeof it.pj !== 'number' || !Number.isFinite(it.pj) || typeof it.ps !== 'number' || !Number.isFinite(it.ps)) return bad(res);
        if (it.max !== undefined && !Number.isInteger(it.max)) return bad(res);
      }
      setTemplate(items);
      logAudit(session.id, 'template', 'template', null, { count: items.length });
      broadcastConfig();
      return json(res, 200, { ok: true });
    }
    if (url.pathname === '/admin/template/reset' && method === 'POST') {
      resetTemplate();
      logAudit(session.id, 'template', 'template', null, { reset: true });
      broadcastConfig();
      return json(res, 200, { ok: true });
    }

    // 토너먼트 8슬롯 배정 저장 → /contest 대진표에 즉시 반영 (config 브로드캐스트)
    if (url.pathname === '/admin/tournament/slots' && method === 'PUT') {
      const body = (await readJson(req, MAX_ADMIN_BODY_BYTES)) as { cat?: unknown; teamIds?: unknown } | null;
      const cat = body?.cat;
      const teamIds = body?.teamIds;
      if ((cat !== 'J' && cat !== 'S') || !Array.isArray(teamIds) || teamIds.length !== 8) return bad(res);
      if (!teamIds.every((t) => t === null || (typeof t === 'string' && t.length <= 16))) return bad(res);
      saveTournamentSlots(cat, teamIds as (string | null)[]);
      logAudit(session.id, 'tournament', 'tournament', cat, { slots: teamIds.filter(Boolean).length });
      broadcastConfig();
      return json(res, 200, { ok: true });
    }

    // 토너먼트 경기 결과 저장. 승자가 다음 라운드로 진출하고, 준결승 패자는 3·4위전으로 간다.
    // 무승부는 허용하지 않는다. 같은 경기를 다시 저장하면 하위 라운드까지 다시 계산된다.
    if (url.pathname === '/admin/tournament/result' && method === 'POST') {
      const body = (await readJson(req, MAX_ADMIN_BODY_BYTES)) as { cat?: unknown; round?: unknown; gameNo?: unknown; scoreA?: unknown; scoreB?: unknown } | null;
      const { cat, round, gameNo, scoreA, scoreB } = body ?? {};
      if ((cat !== 'J' && cat !== 'S') || (round !== 'QF' && round !== 'SF' && round !== 'F' && round !== '3P')) return bad(res);
      if (!Number.isInteger(gameNo) || typeof scoreA !== 'number' || !Number.isFinite(scoreA) || typeof scoreB !== 'number' || !Number.isFinite(scoreB)) return bad(res);
      try {
        saveTournamentResult(cat, round as TournamentRound, gameNo as number, scoreA, scoreB);
      } catch (e) {
        return json(res, 400, { ok: false, error: (e as Error).message });
      }
      logAudit(session.id, 'tournament', 'tournament', `${cat} ${round}-${gameNo}`, { scoreA, scoreB });
      broadcastConfig();
      return json(res, 200, { ok: true });
    }

    // 준결승 이후 슬롯에 팀을 직접 지정 (기권·부전승 등). 빈 칸(null)으로 비울 수도 있다.
    // 해당 경기 결과는 지워지고, 상위 라운드 결과를 다시 저장하면 자동 배정으로 덮인다.
    if (url.pathname === '/admin/tournament/set-team' && method === 'POST') {
      const body = (await readJson(req, MAX_ADMIN_BODY_BYTES)) as { cat?: unknown; round?: unknown; gameNo?: unknown; side?: unknown; teamId?: unknown } | null;
      const { cat, round, gameNo, side, teamId } = body ?? {};
      if ((cat !== 'J' && cat !== 'S') || (round !== 'SF' && round !== 'F' && round !== '3P') || !Number.isInteger(gameNo)) return bad(res);
      if (side !== 'A' && side !== 'B') return bad(res);
      if (teamId !== null && (typeof teamId !== 'string' || teamId.length > 16)) return bad(res);
      try {
        if (!setTournamentTeam(cat, round as TournamentRound, gameNo as number, side, teamId)) return json(res, 404, { ok: false, error: 'game_not_found' });
      } catch (e) {
        return json(res, 409, { ok: false, error: (e as Error).message });
      }
      logAudit(session.id, 'tournament', 'tournament', `${cat} ${round}-${gameNo}`, { setTeam: { side, teamId } });
      broadcastConfig();
      return json(res, 200, { ok: true });
    }

    // 계정 목록 (참가자·심판·관리자 통합, 마지막 로그인 포함)
    if (url.pathname === '/admin/users' && method === 'GET') {
      const role = url.searchParams.get('role');
      const q = url.searchParams.get('q') ?? undefined;
      const roleFilter: AccountRole | 'staff' | undefined =
        role === 'user' || role === 'judge' || role === 'admin' ? role : role === 'staff' ? 'staff' : undefined;
      const r = listUsers({ role: roleFilter, q });
      return json(res, 200, { ok: true, users: r.users, total: r.total });
    }

    // 모든 계정의 세션을 즉시 폐기 — 침해 의심이나 대회 전에 사용. 본인 포함 전원 재로그인.
    if (url.pathname === '/admin/sessions/revoke-all' && method === 'POST') {
      revokeAllSessions();
      logAudit(session.id, 'reset_password', 'sessions', null, { revokeAll: true });
      return json(res, 200, { ok: true });
    }

    // 심판 담당 테이블 배정 (REF01~REF08 의 고정 규칙과 별개, 추가 심판 지정/변경)
    if (url.pathname === '/admin/accounts/assign' && method === 'POST') {
      const body = (await readJson(req, MAX_ADMIN_BODY_BYTES)) as { id?: unknown; table?: unknown } | null;
      if (typeof body?.id !== 'string') return bad(res);
      if (body.table !== null && body.table !== undefined && (!Number.isInteger(body.table) || (body.table as number) < 1 || (body.table as number) > 8)) return bad(res);
      if (!assignJudgeTable(body.id, (body.table as number | null | undefined) ?? null)) return json(res, 404, { ok: false, error: 'judge_not_found' });
      logAudit(session.id, 'issue', 'account', body.id, { assignTable: body.table ?? null });
      broadcastConfig();
      return json(res, 200, { ok: true });
    }

    // 계정 일괄 발급 (관리자가 올린 CSV). 결과의 password 는 평문 한 번만 낸다 → 클라이언트가 CSV 로 저장.
    if (url.pathname === '/admin/accounts/issue' && method === 'POST') {
      const body = (await readJson(req, MAX_ADMIN_BODY_BYTES)) as { accounts?: unknown } | null;
      const accounts = body?.accounts;
      if (!Array.isArray(accounts) || accounts.length === 0 || accounts.length > 500) return bad(res);
      for (const a of accounts as { id?: unknown; name?: unknown; role?: unknown; table?: unknown }[]) {
        if (typeof a.id !== 'string' || !/^[a-zA-Z0-9._-]{4,32}$/.test(a.id) || typeof a.name !== 'string' || (a.role !== 'judge' && a.role !== 'admin')) return bad(res);
        if (a.table !== undefined && a.table !== null && (!Number.isInteger(a.table) || (a.table as number) < 1 || (a.table as number) > 8)) return bad(res);
      }
      try {
        const issued = issueAccounts(
          accounts.map((a) => ({ id: a.id as string, name: a.name as string, role: a.role as 'judge' | 'admin', judgeTable: (a.table as number | null | undefined) ?? null })),
        );
        logAudit(session.id, 'issue', 'account', null, { count: issued.length, ids: issued.map((i) => i.id) });
        return json(res, 200, { ok: true, issued });
      } catch (e) {
        return json(res, 409, { ok: false, error: String((e as Error).message ?? e) });
      }
    }

    // 비밀번호 일괄 재발급. ids 지정 또는 역할(judge/admin) 전체. 결과는 평문 한 번만.
    if (url.pathname === '/admin/accounts/reset-password' && method === 'POST') {
      const body = (await readJson(req, MAX_ADMIN_BODY_BYTES)) as { ids?: unknown; role?: unknown } | null;
      const ids = Array.isArray(body?.ids) ? body.ids.filter((x): x is string => typeof x === 'string') : undefined;
      const role = body?.role === 'judge' || body?.role === 'admin' || body?.role === 'user' ? body.role : undefined;
      if (!ids && !role) return bad(res);
      const reset = resetPasswords({ ids, role });
      if (reset.length === 0) return json(res, 404, { ok: false, error: 'no_targets' });
      logAudit(session.id, 'reset_password', 'account', null, { count: reset.length, ids: reset.map((r) => r.id) });
      return json(res, 200, { ok: true, reset });
    }

    if (url.pathname === '/admin/pending' && method === 'GET') {
      const r = getPending();
      return json(res, 200, { ok: true, pending: r.pending, total: r.total });
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
      return json(res, 200, { ok: true, scores: r.scores, total: r.total });
    }

    // 점수 확정 / 정정 / 반려. 심판은 서명 후 스스로 고칠 수 없고 이 경로를 거친다.
    const scoreAction = url.pathname.match(/^\/admin\/scores\/(confirm|modify|reject)$/);
    if (scoreAction && method === 'POST') {
      const body = (await readJson(req, MAX_ADMIN_BODY_BYTES)) as { matchId?: unknown; teamId?: unknown; judgeId?: unknown; points?: unknown; sheet?: unknown; penCnt?: unknown; reason?: unknown } | null;
      if (!body) return bad(res);
      const { matchId, teamId, judgeId } = body;
      if (typeof matchId !== 'string' || typeof teamId !== 'string' || typeof judgeId !== 'string') return bad(res);
      let changed: boolean;
      if (scoreAction[1] === 'confirm') {
        changed = confirmScore(matchId, teamId, judgeId, session.id);
      } else if (scoreAction[1] === 'reject') {
        changed = rejectScore(matchId, teamId, judgeId, session.id, typeof body.reason === 'string' ? body.reason : '');
      } else {
        if (body.points !== undefined && (typeof body.points !== 'number' || !Number.isFinite(body.points))) return bad(res);
        if (body.penCnt !== undefined && !Number.isInteger(body.penCnt)) return bad(res);
        changed = modifyScore(matchId, teamId, judgeId, session.id, {
          points: body.points as number | undefined,
          sheet: body.sheet === undefined ? undefined : body.sheet === null ? null : JSON.stringify(body.sheet),
          penCnt: body.penCnt as number | undefined,
          reason: typeof body.reason === 'string' ? body.reason : undefined,
        });
      }
      if (!changed) return json(res, 409, { ok: false, error: 'not_found_or_bad_status' });
      scheduleBroadcast();
      return json(res, 200, { ok: true });
    }

    // 설정 변경: 자동 확정, 순위판 공개, 점수 가리기, 공지, 1·2라운드 심사 점수, 테이블 진행 순서, 순위 조정. 공지·보드 설정은 접속 중인 클라이언트에 즉시 반영한다.
    if (url.pathname === '/admin/settings' && method === 'PUT') {
      const body = (await readJson(req, MAX_ADMIN_BODY_BYTES)) as
        | { autoConfirm?: unknown; boardPublic?: unknown; hideScores?: unknown; notice?: unknown; roundScores?: unknown; tableOrder?: unknown; rankOrder?: unknown }
        | null;
      if (!body) return bad(res);
      if (body.autoConfirm !== undefined) {
        if (typeof body.autoConfirm !== 'boolean') return bad(res);
        setSetting('auto_confirm', body.autoConfirm ? '1' : '0');
      }
      if (body.boardPublic !== undefined) {
        if (typeof body.boardPublic !== 'boolean') return bad(res);
        setSetting('board_public', body.boardPublic ? '1' : '0');
      }
      if (body.hideScores !== undefined) {
        if (typeof body.hideScores !== 'boolean') return bad(res);
        setSetting('hide_scores', body.hideScores ? '1' : '0');
      }
      if (body.roundScores !== undefined) {
        if (typeof body.roundScores !== 'object' || body.roundScores === null || Array.isArray(body.roundScores)) return bad(res);
        for (const v of Object.values(body.roundScores)) {
          if (typeof v !== 'object' || v === null) return bad(res);
          const { r1, r2 } = v as { r1?: unknown; r2?: unknown };
          if ((r1 !== undefined && typeof r1 !== 'string' && typeof r1 !== 'number') || (r2 !== undefined && typeof r2 !== 'string' && typeof r2 !== 'number')) return bad(res);
        }
        setSetting('round_scores', JSON.stringify(body.roundScores));
      }
      // 당일 진행 순서: 테이블 1~8 의 실행 순서 (순열)
      if (body.tableOrder !== undefined) {
        if (!Array.isArray(body.tableOrder) || body.tableOrder.length !== 8 || !body.tableOrder.every((n) => Number.isInteger(n) && n >= 1 && n <= 8)) return bad(res);
        if (new Set(body.tableOrder as number[]).size !== 8) return bad(res, 'table_order_must_be_permutation');
        setSetting('table_order', JSON.stringify(body.tableOrder));
      }
      // 순위 조정: 부문별 팀 ID 순서. 빈 배열이면 설정을 지워 계산 순위로 되돌린다.
      if (body.rankOrder !== undefined) {
        if (typeof body.rankOrder !== 'object' || body.rankOrder === null || Array.isArray(body.rankOrder)) return bad(res);
        const { S, J } = body.rankOrder as { S?: unknown; J?: unknown };
        for (const v of [S, J]) {
          if (v !== undefined && (!Array.isArray(v) || !v.every((x) => typeof x === 'string' && x.length <= 16))) return bad(res);
        }
        const clean = { ...(Array.isArray(S) && S.length > 0 ? { S } : {}), ...(Array.isArray(J) && J.length > 0 ? { J } : {}) };
        if (Object.keys(clean).length === 0) {
          deleteSetting('rank_order');
        } else {
          setSetting('rank_order', JSON.stringify(clean));
        }
      }
      if (body.notice !== undefined) {
        if (typeof body.notice !== 'object' || body.notice === null) return bad(res);
        const { message, updatedAt } = body.notice as { message?: unknown; updatedAt?: unknown };
        if (typeof message !== 'string') return bad(res);
        setSetting('notice', JSON.stringify({ message, updatedAt: typeof updatedAt === 'number' ? updatedAt : Date.now() }));
        io.emit('notice', { message, updatedAt: Date.now() });
      }
      logAudit(session.id, 'settings', 'settings', null, body);
      broadcastConfig();
      emitLeaderboard();
      return json(res, 200, { ok: true });
    }

    // 팀 명단 전체 교체 (관리자 Import). 대진(matches)은 별도 API로 다시 저장해야 한다.
    // 점수가 한 건이라도 있으면 명단 교체를 막는다 — 경기·팀 ID 가 얽힌 데이터가 고아가 된다.
    if (url.pathname === '/admin/teams' && method === 'PUT') {
      const body = (await readJson(req, MAX_ADMIN_BODY_BYTES)) as { teams?: unknown } | null;
      const teams = body?.teams;
      if (!Array.isArray(teams) || teams.length === 0) return bad(res);
      const seen = new Set<string>();
      for (const t of teams as { id?: unknown; cat?: unknown; code?: unknown; name?: unknown; members?: unknown }[]) {
        if (typeof t.id !== 'string' || t.id.length > 16 || (t.cat !== 'J' && t.cat !== 'S') ||
          typeof t.code !== 'string' || t.code.length > 32 || typeof t.name !== 'string' || t.name.length > 128 ||
          !Array.isArray(t.members) || t.members.length === 0 || !t.members.every((m) => typeof m === 'string' && m.length <= 32)) return bad(res);
        if (seen.has(t.id) || seen.has(t.name)) return bad(res, 'duplicate_in_payload');
        seen.add(t.id);
        seen.add(t.name);
      }
      if (countScores() > 0) return json(res, 409, { ok: false, error: 'scores_exist' });
      try {
        replaceTeams(teams as Parameters<typeof replaceTeams>[0]);
      } catch (e) {
        return json(res, 409, { ok: false, error: (e as Error).message });
      }
      logAudit(session.id, 'teams', 'teams', null, { count: teams.length });
      broadcastConfig();
      return json(res, 200, { ok: true });
    }

    // 대진·심판 배정 전체 교체. 팀은 명단에 있는 것만 배정할 수 있다.
    if (url.pathname === '/admin/matches' && method === 'PUT') {
      const body = (await readJson(req, MAX_ADMIN_BODY_BYTES)) as { matches?: unknown } | null;
      const matches = body?.matches;
      if (!Array.isArray(matches) || matches.length === 0) return bad(res);
      for (const m of matches as { id?: unknown; round?: unknown; cat?: unknown; wave?: unknown; table?: unknown; field?: unknown; team?: unknown }[]) {
        if (typeof m.id !== 'string' || (m.round !== 1 && m.round !== 2) || (m.cat !== 'J' && m.cat !== 'S') ||
          (m.wave !== 'A' && m.wave !== 'B') || !Number.isInteger(m.table) || (m.table as number) < 1 || (m.table as number) > 8 ||
          (m.field !== '좌' && m.field !== '우') || typeof m.team !== 'string') return bad(res);
      }
      try {
        replaceMatches(matches as Parameters<typeof replaceMatches>[0]);
      } catch (e) {
        return json(res, 409, { ok: false, error: (e as Error).message });
      }
      logAudit(session.id, 'matches', 'matches', null, { count: matches.length });
      broadcastConfig();
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { ok: false, error: 'not_found' });
  }

  if (url.pathname !== '/score') return void res.writeHead(404).end();
  if (method === 'OPTIONS') return void res.writeHead(204).end();
  if (method !== 'POST') return void res.writeHead(405).end();

  if (!session) return json(res, 401, { ok: false, error: 'unauthorized' });
  const body = await readJson(req, MAX_BODY_BYTES);
  if (body === null) return json(res, 413, { ok: false, error: 'too_large' });
  const result = submitScore(session, body as SubmitPayload | undefined);
  json(res, result.ok ? 200 : result.error === 'forbidden' ? 403 : result.error === 'internal' ? 500 : 400, result);
}

const io = new Server(httpServer, {
  cors: { origin: origins, credentials: true },
  // 와이파이가 불안정한 환경: 끊김은 최대 ~10초 안에 감지, 짧은 끊김은 세션 복구
  pingInterval: 5_000,
  pingTimeout: 5_000,
  connectionStateRecovery: { maxDisconnectionDuration: 2 * 60_000 },
});

// 로그인 쿠키(세션)로 인증. 비로그인은 연결 거부, 순위표 구독은 모든 역할 허용.
io.use((socket, next) => {
  const session = sessionFromCookie(socket.handshake.headers.cookie);
  if (!session) return next(new Error('unauthorized'));
  socket.data.session = session;
  next();
});

// 점수가 몰려도 순위표는 BROADCAST_MS 당 최대 1회만 전송
let timer: NodeJS.Timeout | null = null;
function scheduleBroadcast() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    emitLeaderboard();
  }, BROADCAST_MS);
}

// 보드 비공개 설정이 꺼져 있으면 관리자 외에게는 빈 순위표를 본낸다.
function emitLeaderboard() {
  const standings = getStandings();
  const visible = boardPublic();
  for (const socket of io.sockets.sockets.values()) {
    const session = socket.data.session as Session;
    socket.emit('leaderboard', visible || session.role === 'admin' ? standings : []);
  }
}

function broadcastConfig() {
  io.emit('config', { updatedAt: Date.now() });
}

io.on('connection', (socket) => {
  const session = socket.data.session as Session;
  socket.emit('leaderboard', boardPublic() || session.role === 'admin' ? getStandings() : []);

  socket.on('score:submit', (p: SubmitPayload, ack?: (res: Result) => void) => {
    try {
      ack?.(submitScore(session, p));
    } catch (e) {
      console.error('score:submit 처리 실패:', e);
      ack?.({ ok: false, error: 'internal' });
    }
  });
});

httpServer.listen(PORT, () => console.log(`realtime server on :${PORT}`));
