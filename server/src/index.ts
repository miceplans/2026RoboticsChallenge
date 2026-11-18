import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { boardPublic, bootstrapStaffIfNone, getProgress, getStandings, normalizeMatchSlots, migrateAutoConfirmOn, seedDefaultAccounts, seedIfEmpty } from './db.ts';
import { assertAuthSecret, sessionFromCookie, type Session } from './session.ts';
import { createAuthRoutes } from './routes/auth.ts';
import { createPublicRoutes } from './routes/public.ts';
import { createJudgeRoutes } from './routes/judge.ts';
import { createAdminRoutes } from './routes/admin.ts';
import { createScoreRoutes, submitScore, type Result } from './routes/score.ts';
import { json } from './http.ts';

assertAuthSecret(); // 운영: AUTH_SECRET 필수·32자 이상·개발 기본값 금지 (lib/session.ts 와 동일 규칙)

const PORT = Number(process.env.PORT ?? 4000);
// 쉼표로 여러 개: https://example.com,https://judge.example.com
// 개발용 기본값은 localhost 뿐이다. 운영에서는 반드시 실제 도메인 목록을 CORS_ORIGINS 로 지정한다.
const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://judge.localhost:3000,http://admin.localhost:3000').split(',');
if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGINS) {
  throw new Error('운영 환경에서는 CORS_ORIGINS 를 반드시 설정해야 합니다 (개발용 localhost 목록은 개발 전용).');
}
// Next 서버(배포 웹 컨테이너)만 /auth/* 를 호출하게 막는 공유 비밀. 운영 필수. (검사 가드는 router.ts 의 internalOnly)
if (process.env.NODE_ENV === 'production' && !process.env.INTERNAL_API_SECRET) {
  throw new Error('운영 환경에서는 INTERNAL_API_SECRET 를 반드시 설정해야 합니다 (Next↔서버 서버 간 호출용 공유 비밀).');
}

seedIfEmpty();
migrateAutoConfirmOn();
normalizeMatchSlots();
seedDefaultAccounts(); // 없는 기본 계정만 만든다 (팀별·관리자 2·심판 16)
bootstrapStaffIfNone();

// 대회 서버 — 예외 하나로 프로세스가 날아가면 모든 심판 제출이 끊긴다.
// 정상 경로는 각 핸들러가 잡고, 여기는 마지막 방어선으로 로그만 남겨 프로세스를 살린다.
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e));
process.on('uncaughtException', (e) => console.error('uncaughtException:', e));

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

  // CSRF 방어 (SameSite=Lax 쿠키와 병용): 쿠키를 쓰는 쓰기 요청은 브라우저가 낸 Origin 이
  // CORS 허용 목록에 있어야 한다. Origin 헤더가 없는 비브라우저 호출(서버 간 등)은 통과한다.
  if ((method === 'POST' || method === 'PUT' || method === 'DELETE') && origin && !origins.includes(origin)) {
    return json(res, 403, { ok: false, error: 'forbidden_origin' });
  }

  // --- 라우터 장착 (인증·검증 가드는 각 라우트 등록부에 선언돼 있다) ---
  if (await authRoutes.dispatch(req, res, url, method, session)) return;
  if (await publicRoutes.dispatch(req, res, url, method, session)) return;
  if (await judgeRoutes.dispatch(req, res, url, method, session)) return;
  if (await scoreRoutes.dispatch(req, res, url, method, session)) return;
  if (url.pathname.startsWith('/admin/')) {
    if (!(await adminRoutes.dispatch(req, res, url, method, session))) json(res, 404, { ok: false, error: 'not_found' });
    return;
  }
  // /score 는 POST 만 — 다른 메서드는 405 (라우터에 POST 라우트만 있어 평번이 아닌 요청이 여기 떨어진다)
  if (url.pathname === '/score') return void json(res, 405, { ok: false, error: 'method_not_allowed' });

  res.writeHead(404).end();
}

const io = new Server(httpServer, {
  cors: { origin: origins, credentials: true },
  // 와이파이가 불안정한 환경: 끊김은 최대 ~10초 안에 감지, 짧은 끊김은 세션 복구
  pingInterval: 5_000,
  pingTimeout: 5_000,
  connectionStateRecovery: { maxDisconnectionDuration: 2 * 60_000 },
});

// 공개 순위판은 비로그인도 읽을 수 있다. 점수 제출은 아래 핸들러에서 세션을 다시 확인한다.
io.use((socket, next) => {
  const session = sessionFromCookie(socket.handshake.headers.cookie);
  if (!session && !boardPublic()) return next(new Error('unauthorized'));
  socket.data.session = session;
  next();
});

// 점수가 몰려도 순위표는 BROADCAST_MS 당 최대 1회만 전송
let timer: NodeJS.Timeout | null = null;
// 점수 확정·제출로 예선 진행 상태(2차 열림, 8강 열림)가 바뀌면 config 도 알려, 관리자 화면의 잠금이 새로고침 없이 풀리게 한다
let lastProgress = JSON.stringify(getProgress());
function scheduleBroadcast() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    emitLeaderboard();
    const progress = JSON.stringify(getProgress());
    if (progress !== lastProgress) {
      broadcastConfig();
      lastProgress = progress;
    }
  }, 500);
}

// 보드 비공개 설정이 꺼져 있으면 관리자 외에게는 빈 순위표를 보낸다.
function emitLeaderboard() {
  const standings = getStandings();
  const visible = boardPublic();
  for (const socket of io.sockets.sockets.values()) {
    const session = socket.data.session as Session | undefined;
    socket.emit('leaderboard', visible || session?.role === 'admin' ? standings : []);
  }
}

function broadcastConfig() {
  io.emit('config', { updatedAt: Date.now() });
}

// --- 라우터 (훅은 위 io 함수들을 주입한다) ---
const authRoutes = createAuthRoutes();
const publicRoutes = createPublicRoutes();
const judgeRoutes = createJudgeRoutes({ broadcastConfig });
const adminRoutes = createAdminRoutes({
  broadcastConfig,
  emitLeaderboard,
  emitNotice: (notice) => io.emit('notice', notice),
  onScoresChanged: scheduleBroadcast,
});
const scoreRoutes = createScoreRoutes({ onSaved: scheduleBroadcast });

io.on('connection', (socket) => {
  const session = socket.data.session as Session | undefined;
  socket.emit('leaderboard', boardPublic() || session?.role === 'admin' ? getStandings() : []);

  socket.on('score:submit', (p: unknown, ack?: (res: Result) => void) => {
    if (!session) return ack?.({ ok: false, error: 'unauthorized' });
    try {
      const result = submitScore(session, p);
      if (result.ok) scheduleBroadcast();
      ack?.(result);
    } catch (e) {
      console.error('score:submit 처리 실패:', e);
      ack?.({ ok: false, error: 'internal' });
    }
  });
});

httpServer.listen(PORT, () => console.log(`realtime server on :${PORT}`));
