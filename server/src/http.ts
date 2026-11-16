import type { IncomingMessage, ServerResponse } from 'node:http';

// --- HTTP 조각들. 라우트 파일들이 공통으로 쓴다 ---

export const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
};

export const bad = (res: ServerResponse, error = 'invalid') => json(res, 400, { ok: false, error });

// 한도를 넘어도 연결을 끊지 않고 끝까지 읽어 버린 뒤 413 으로 답한다.
// 길이는 바이트로 재고, 30초가 넘으면 끊는다 — 느린 전송으로 워커를 붙잡는 공격을 막는다.
export function readBody(req: IncomingMessage, limit: number): Promise<string | null> {
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
export const readJson = async (req: IncomingMessage, limit: number): Promise<unknown | null> => {
  if (!(req.headers['content-type'] ?? '').includes('application/json')) return null;
  const body = await readBody(req, limit);
  if (body === null) return null;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
};
