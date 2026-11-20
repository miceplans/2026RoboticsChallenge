import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { getRobotApproval, getScoreList, getStandings, saveRobotApproval, saveScore } from './db.ts';
import { sessionFromCookie, type Session } from './session.ts';

const PORT = Number(process.env.PORT ?? 4000);
// 쉼표로 여러 개: https://example.com,https://judge.example.com
const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://judge.localhost:3000,http://admin.localhost:3000').split(',');
const BROADCAST_MS = 500;

type SubmitPayload = { matchId: unknown; teamId: unknown; points: unknown; ts: unknown; sheet?: unknown };
type Result = { ok: true } | { ok: false; error: string };
type RobotApprovalPayload = { teamId: unknown; robotCount: unknown; approvedRobotIds: unknown };

// 채점지(서명 이미지 포함) 상한. 초과분은 거부한다.
const MAX_SHEET_BYTES = 400 * 1024;
const MAX_BODY_BYTES = MAX_SHEET_BYTES + 4096;

// 소켓/HTTP 공통. 클라이언트는 확인(ok)을 받을 때까지 같은 payload 를 재전송해도 안전하다 (upsert + ts 비교).
function submitScore(session: Session, p: SubmitPayload | undefined): Result {
  if (session.role !== 'judge' && session.role !== 'admin') return { ok: false, error: 'forbidden' };

  const { matchId, teamId, points, ts, sheet } = p ?? {};
  if (
    typeof matchId !== 'string' || !matchId || matchId.length > 64 ||
    typeof teamId !== 'string' || !teamId || teamId.length > 64 ||
    typeof points !== 'number' || !Number.isFinite(points) ||
    typeof ts !== 'number' || !Number.isFinite(ts) ||
    (sheet !== undefined && (typeof sheet !== 'object' || sheet === null || Array.isArray(sheet)))
  ) {
    return { ok: false, error: 'invalid' };
  }
  const sheetJson = sheet === undefined ? null : JSON.stringify(sheet);
  if (sheetJson && sheetJson.length > MAX_SHEET_BYTES) return { ok: false, error: 'too_large' };

  // judgeId 는 클라이언트가 보낸 값이 아니라 세션에서만 가져온다
  saveScore({ matchId, teamId, judgeId: session.id, points, ts, sheet: sheetJson });
  scheduleBroadcast();
  return { ok: true };
}

function parseRobotApproval(session: Session, payload: RobotApprovalPayload | undefined) {
  if (session.role !== 'admin') return { error: 'forbidden' as const };
  const { teamId, robotCount, approvedRobotIds } = payload ?? {};
  if (typeof teamId !== 'string' || !teamId || teamId.length > 64 || !Number.isInteger(robotCount) || robotCount < 0 || robotCount > 200 || !Array.isArray(approvedRobotIds) || approvedRobotIds.some((id) => typeof id !== 'string' || !/^R[1-9]\d*$/.test(id) || Number(id.slice(1)) > robotCount)) {
    return { error: 'invalid' as const };
  }
  return { approval: { teamId, robotCount, approvedRobotIds: [...new Set(approvedRobotIds)], updatedAt: Date.now() } };
}

// WebSocket 이 막히거나 불안정할 때 클라이언트가 쓰는 폴백: POST /score
const httpServer = createServer((req, res) => {
  const origin = req.headers.origin;
  if (origin && origins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    res.setHeader('Vary', 'Origin');
  }
  const json = (status: number, body: Result) => {
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  };

  if (req.url === '/health') return void res.end('ok');
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/robot-approval' && req.method === 'GET') {
    const session = sessionFromCookie(req.headers.cookie);
    const teamId = url.searchParams.get('teamId');
    if (!session) return json(401, { ok: false, error: 'unauthorized' });
    if (!teamId || teamId.length > 64) return json(400, { ok: false, error: 'invalid' });
    return void res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ approval: getRobotApproval(teamId) }));
  }
  if (url.pathname === '/scores' && req.method === 'GET') {
    const session = sessionFromCookie(req.headers.cookie);
    if (!session) return json(401, { ok: false, error: 'unauthorized' });
    if (session.role !== 'admin') return json(403, { ok: false, error: 'forbidden' });
    return void res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ scores: getScoreList() }));
  }
  if (url.pathname !== '/score' && url.pathname !== '/robot-approval') return void res.writeHead(404).end();
  if (req.method === 'OPTIONS') return void res.writeHead(204).end();
  if (req.method !== 'POST') return void res.writeHead(405).end();

  const session = sessionFromCookie(req.headers.cookie);
  if (!session) return json(401, { ok: false, error: 'unauthorized' });

  // 한도를 넘어도 연결을 끊지 않고 끝까지 읽어 버린 뒤 413 으로 답한다.
  // 끊어 버리면 클라이언트가 네트워크 오류로 보고 같은 요청을 영원히 재시도한다.
  let body = '';
  let tooLarge = false;
  req.on('data', (chunk) => {
    if (tooLarge) return;
    body += chunk;
    if (body.length > MAX_BODY_BYTES) {
      tooLarge = true;
      body = '';
    }
  });
  req.on('end', () => {
    if (tooLarge) return json(413, { ok: false, error: 'too_large' });
    let payload: SubmitPayload | RobotApprovalPayload | undefined;
    try {
      payload = JSON.parse(body);
    } catch {
      return json(400, { ok: false, error: 'invalid' });
    }
    if (url.pathname === '/robot-approval') {
      const parsed = parseRobotApproval(session, payload as RobotApprovalPayload);
      if ('error' in parsed) return json(parsed.error === 'forbidden' ? 403 : 400, { ok: false, error: parsed.error });
      saveRobotApproval(parsed.approval);
      io.emit('robot-approval', parsed.approval);
      return void res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ approval: parsed.approval }));
    }
    const result = submitScore(session, payload as SubmitPayload);
    json(result.ok ? 200 : result.error === 'forbidden' ? 403 : 400, result);
  });
});

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
    io.emit('leaderboard', getStandings());
  }, BROADCAST_MS);
}

io.on('connection', (socket) => {
  const session = socket.data.session as Session;
  socket.emit('leaderboard', getStandings());

  socket.on('score:submit', (p: SubmitPayload, ack?: (res: Result) => void) => {
    const result = submitScore(session, p);
    ack?.(result);
  });

  socket.on('robot-approval:save', (p: RobotApprovalPayload, ack?: (res: Result & { approval?: unknown }) => void) => {
    const parsed = parseRobotApproval(session, p);
    if ('error' in parsed) return ack?.({ ok: false, error: parsed.error });
    saveRobotApproval(parsed.approval);
    io.emit('robot-approval', parsed.approval);
    ack?.({ ok: true, approval: parsed.approval });
  });
});

httpServer.listen(PORT, () => console.log(`realtime server on :${PORT}`));
