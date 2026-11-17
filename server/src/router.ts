import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Session, Role } from './session.ts';
import { bad, json, readJson } from './http.ts';
import { internalOk } from './guards.ts';
import { ValidationError, obj, type V } from './validate.ts';

// --- 미니 라우터 — if (url.pathname === ...) 체인 대신 선언적 라우트 테이블 ---
// 가드(인증·검증)와 핸들러(비즈니스 로직)를 분리해 등록한다.

export type Ctx = {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  method: string;
  params: Record<string, string>; // 경로 매개변수 (:action)
  session: Session | null;
  body: unknown; // body() 가드가 검증해 채운다
  query: unknown; // query() 가드가 검증해 채운다
};

// false 를 돌려주면 이미 응답을 끝낸 것으로 본다
export type Guard = (ctx: Ctx) => boolean | Promise<boolean>;
export type Handler = (ctx: Ctx) => void | Promise<void>;

type Route = { method: string; segs: string[]; guards: Guard[]; handler: Handler };

const segsOf = (path: string): string[] => path.split('/').filter(Boolean);

export class Router {
  private routes: Route[] = [];
  private middleware: Guard[] = [];
  readonly prefix: string;

  constructor(prefix = '') {
    this.prefix = prefix;
  }
  // 이 라우터의 모든 라우트에 앞서 실행할 가드 (라우트 매칭 전에 실행된다)
  use(...guards: Guard[]): this {
    this.middleware.push(...guards);
    return this;
  }

  private add(method: string, path: string, handlers: [...Guard[], Handler]): this {
    const handler = handlers[handlers.length - 1] as Handler;
    const guards = handlers.slice(0, -1) as Guard[];
    this.routes.push({ method, segs: segsOf(`${this.prefix}${path}`), guards, handler });
    return this;
  }

  get(path: string, ...handlers: [...Guard[], Handler]): this {
    return this.add('GET', path, handlers);
  }
  post(path: string, ...handlers: [...Guard[], Handler]): this {
    return this.add('POST', path, handlers);
  }
  put(path: string, ...handlers: [...Guard[], Handler]): this {
    return this.add('PUT', path, handlers);
  }

  // 일치하는 라우트를 실행한다. 처리(또는 가드의 거절 응답)를 끝냈으면 true.
  async dispatch(req: IncomingMessage, res: ServerResponse, url: URL, method: string, session: Session | null): Promise<boolean> {
    if (this.prefix && !url.pathname.startsWith(`${this.prefix}/`)) return false;
    const ctx: Ctx = { req, res, url, method, params: {}, session, body: undefined, query: undefined };
    for (const g of this.middleware) {
      if (!(await g(ctx))) return true;
    }
    const pathSegs = segsOf(url.pathname);
    for (const r of this.routes) {
      if (r.method !== method || r.segs.length !== pathSegs.length) continue;
      const params: Record<string, string> = {};
      let match = true;
      for (let i = 0; i < r.segs.length; i++) {
        const s = r.segs[i];
        if (s.startsWith(':')) params[s.slice(1)] = decodeURIComponent(pathSegs[i]);
        else if (s !== pathSegs[i]) {
          match = false;
          break;
        }
      }
      if (!match) continue;
      ctx.params = params;
      for (const g of r.guards) {
        if (!(await g(ctx))) return true;
      }
      await r.handler(ctx);
      return true;
    }
    return false;
  }
}

// --- 공통 가드 ---

export const requireSession: Guard = (ctx) => {
  if (!ctx.session) {
    json(ctx.res, 401, { ok: false, error: 'unauthorized' });
    return false;
  }
  return true;
};

export const requireRole = (...roles: Role[]): Guard => (ctx) => {
  if (!ctx.session || !roles.includes(ctx.session.role)) {
    json(ctx.res, 403, { ok: false, error: 'forbidden' });
    return false;
  }
  return true;
};

// Next 서버(배포 웹 컨테이너)만 /auth/* 를 호출하게 막는 공유 비밀 검사
export const internalOnly: Guard = (ctx) => {
  if (!internalOk(ctx.req)) {
    json(ctx.res, 403, { ok: false, error: 'forbidden' });
    return false;
  }
  return true;
};

// JSON 본문을 읽고 스키마로 검증해 ctx.body 에 넣는다. 실패는 400 (nullStatus 를 주면 본문 읽기 실패만 그 코드로).
export const body = <T>(schema: V<T>, limit: number, opts: { nullStatus?: number } = {}): Guard => async (ctx) => {
  const raw = await readJson(ctx.req, limit);
  if (raw === null) {
    if (opts.nullStatus) json(ctx.res, opts.nullStatus, { ok: false, error: 'too_large' });
    else bad(ctx.res);
    return false;
  }
  try {
    ctx.body = schema(raw);
    return true;
  } catch (e) {
    bad(ctx.res, e instanceof ValidationError ? e.message : 'invalid');
    return false;
  }
};

// 쿼리스트링을 스키마로 검증해 ctx.query 에 넣는다. 각 키는 첫 번째 값(없으면 null)으로 들어가니
// 검증기는 문자열|null 을 받도록 qOpt/qNum 같은 쿼리용 조합기를 쓴다. 실패는 400.
export const query = <T extends Record<string, V<unknown>>>(schema: T): Guard => (ctx) => {
  const raw: Record<string, unknown> = {};
  for (const k of Object.keys(schema)) raw[k] = ctx.url.searchParams.get(k);
  try {
    ctx.query = obj(schema)(raw);
    return true;
  } catch (e) {
    bad(ctx.res, e instanceof ValidationError ? e.message : 'invalid');
    return false;
  }
};
