'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  cacheStandings,
  loadLedger,
  markStatus,
  readCachedStandings,
  requestPersistentStorage,
  saveEntry,
  scoreKey,
  type LedgerEntry,
  type Score,
} from './outbox';

export type Standing = { teamId: string; total: number };
export type Status = 'connecting' | 'online' | 'offline' | 'denied';
export type TeamScore = { matchId: string; judgeId: string; points: number; ts: number };
type Result = { ok: true } | { ok: false; error: string };

const RETRY_MS = 3000;
const ACK_TIMEOUT_MS = 5000;

// 개발 환경에서는 접속한 호스트의 :4000 (judge.localhost 등 서브도메인 쿠키가 그대로 전달됨)
const serverUrl = () => process.env.NEXT_PUBLIC_REALTIME_URL ?? `${location.protocol}//${location.hostname}:4000`;

// 서버로 보내는 필드만 추린다 (status 등 로컬 전용 필드 제외)
const wire = ({ matchId, teamId, points, ts, penCnt, sheet }: Score): Score => ({ matchId, teamId, points, ts, ...(penCnt !== undefined && { penCnt }), ...(sheet && { sheet }) });

export function useRealtime() {
  const [status, setStatus] = useState<Status>('connecting');
  const [standings, setStandings] = useState<Standing[]>([]);
  const [standingsAt, setStandingsAt] = useState<number | null>(null);
  const [history, setHistory] = useState<LedgerEntry[]>([]);
  const [rejected, setRejected] = useState<string | null>(null);
  const ledger = useRef(new Map<string, LedgerEntry>());
  const flushRef = useRef(() => {});

  const syncHistory = () => setHistory([...ledger.current.values()].sort((a, b) => b.ts - a.ts));

  useEffect(() => {
    void requestPersistentStorage();
    const cached = readCachedStandings<Standing[]>();
    if (cached) {
      setStandings(cached.data);
      setStandingsAt(cached.at);
    }

    const socket = io(serverUrl(), {
      withCredentials: true,
      // 기본값(1s~5s)보다 촘촘하게 재시도
      reconnectionDelay: 300,
      reconnectionDelayMax: 2000,
    });
    const inflight = new Set<string>();

    // 응답이 없으면(네트워크 실패/타임아웃) null
    const sendViaSocket = (score: Score) =>
      new Promise<Result | null>((resolve) => {
        socket.timeout(ACK_TIMEOUT_MS).emit('score:submit', wire(score), (err: Error | null, res?: Result) => resolve(err ? null : (res ?? null)));
      });

    // WebSocket 이 끊겼거나 막힌 경우의 폴백
    const sendViaHttp = async (score: Score) => {
      try {
        const res = await fetch(`${serverUrl()}/score`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(wire(score)),
          signal: AbortSignal.timeout(ACK_TIMEOUT_MS),
        });
        return (await res.json()) as Result;
      } catch {
        return null; // 프록시의 HTML 오류 응답 등도 여기로 와서 재시도 대상이 된다
      }
    };

    const flush = () => {
      for (const entry of ledger.current.values()) {
        if (entry.status !== 'pending') continue;
        const id = `${scoreKey(entry)}@${entry.ts}`;
        if (inflight.has(id)) continue;
        inflight.add(id);
        void (socket.connected ? sendViaSocket(entry) : sendViaHttp(entry)).then((res) => {
          inflight.delete(id);
          if (!res) return; // 응답 없음: 다음 주기에 재전송
          // 로그인이 풀린 경우 점수는 pending 으로 남겨둔다 (재로그인 후 전송됨)
          if (!res.ok && res.error === 'unauthorized') return setRejected('로그인이 만료되었습니다. 다시 로그인하면 대기 중인 점수가 전송됩니다.');
          // 그 외 거부(invalid/forbidden)는 재시도해도 같으므로 rejected 로 두고 알린다
          if (!res.ok) setRejected(`${entry.matchId} / ${entry.teamId}: ${res.error}`);
          // 전송 중에 같은 키로 더 새로운 점수가 들어왔다면 그건 건드리지 않는다
          const cur = ledger.current.get(scoreKey(entry));
          if (cur && cur.ts === entry.ts) {
            const next = res.ok ? 'acked' : 'rejected';
            ledger.current.set(scoreKey(entry), { ...cur, status: next });
            void markStatus(entry, next);
          }
          syncHistory();
        });
      }
    };
    flushRef.current = flush;

    // 네트워크가 돌아온 순간 backoff 를 기다리지 않고 바로 재연결
    const onOnline = () => {
      if (!socket.connected) socket.connect();
      flush();
    };
    window.addEventListener('online', onOnline);

    socket.on('connect', () => {
      setStatus('online');
      flush();
    });
    socket.on('disconnect', () => setStatus('offline'));
    socket.on('connect_error', () => setStatus(socket.active ? 'offline' : 'denied'));
    socket.on('leaderboard', (data: Standing[]) => {
      setStandings(data);
      setStandingsAt(Date.now());
      cacheStandings(data);
    });

    // 새로고침/재방문 전에 제출했던 기록 복원 (미확인 건은 이어서 전송)
    let alive = true;
    void loadLedger().then((saved) => {
      if (!alive) return;
      for (const e of saved) {
        if ((ledger.current.get(scoreKey(e))?.ts ?? 0) < e.ts) ledger.current.set(scoreKey(e), e);
      }
      syncHistory();
      flush();
    });

    const timer = setInterval(flush, RETRY_MS);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener('online', onOnline);
      socket.disconnect();
    };
  }, []);

  const submitScore = useCallback((matchId: string, teamId: string, points: number, sheet?: Score['sheet'], penCnt?: number) => {
    const key = scoreKey({ matchId, teamId });
    const ts = Math.max(Date.now(), (ledger.current.get(key)?.ts ?? 0) + 1);
    const entry: LedgerEntry = { matchId, teamId, points, ts, penCnt, sheet, status: 'pending' };
    ledger.current.set(key, entry);
    void saveEntry(entry);
    setRejected(null);
    syncHistory();
    flushRef.current();
  }, []);

  // 서버 DB 를 복구/교체한 뒤, 이 기기에 남은 모든 점수를 다시 보낸다 (서버는 ts 비교로 멱등 처리)
  const resendAll = useCallback(() => {
    for (const [key, e] of ledger.current) {
      if (e.status !== 'acked') continue;
      const entry: LedgerEntry = { ...e, status: 'pending' };
      ledger.current.set(key, entry);
      void saveEntry(entry);
    }
    syncHistory();
    flushRef.current();
  }, []);

  const pending = history.filter((e) => e.status === 'pending').length;
  return { status, standings, standingsAt, history, pending, rejected, submitScore, resendAll };
}

// 팀 채점 표 (심판별 제출 점수). 제출 빈도가 낮은 경량 데이터라 소켓 구독 대신 짧은 폴로 읽는다.
// 로그인한 참가자는 자기 팀만 조회할 수 있다 (서버가 세션의 teamId 와 비교).
export function useTeamScores(teamId: string | undefined) {
  const [scores, setScores] = useState<TeamScore[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setScores([]);
    setLoaded(false);
    if (!teamId) return;
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`${serverUrl()}/team-scores?teamId=${encodeURIComponent(teamId)}`, { credentials: 'include' });
        if (res.status === 401 || res.status === 403) {
          // 로그인 만료/타 팀 조회: 마지막 값을 유지하지 않고 비운다
          if (alive) setScores([]);
          return;
        }
        if (!res.ok) return; // 서버 끊김 등: 마지막 값 유지
        const data = (await res.json()) as { ok: true; scores: TeamScore[] } | { ok: false };
        if (alive && data.ok) {
          setScores(data.scores);
          setLoaded(true);
        }
      } catch {
        // 네트워크 오류: 다음 주기에 재시도
      }
    };
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [teamId]);
  return { scores, loaded };
}
