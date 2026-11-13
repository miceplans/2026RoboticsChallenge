'use client';

// 서버 /config 를 받아오는 클라이언트 데이터 레이어.
// lib/judge/data.ts 의 정적 TEAMS/MATCHES 를 대체한다 (관리자가 서버에서 바꾸는 값이므로).
import { useSyncExternalStore } from 'react';
import type { Category } from './judge/rules';

export type Team = { id: string; cat: Category; code: string; name: string; region: string; org: string; coach: string; members: string[] };
export type Match = { id: string; round: 1 | 2; cat: Category; wave: 'A' | 'B'; table: number; field: '좌' | '우'; team: string };
export type Notice = { message: string; updatedAt: number };
export type TournamentGame = {
  cat: Category;
  round: 'R16' | 'QF' | 'SF' | 'F' | '3P';
  gameNo: number;
  teamA: string | null;
  teamB: string | null;
  scoreA: number | null;
  scoreB: number | null;
  winner: string | null;
  status: 'scheduled' | 'done';
  updatedAt?: number;
};
export type ContestConfig = {
  updatedAt: number;
  settings: { autoConfirm: boolean; boardPublic: boolean; notice: Notice };
  template: unknown; // null 이면 lib/judge/rules.ts 기본 항목 사용
  judgeTables: Record<string, number>; // 심판 ID → 담당 테이블 (REF 외 추가 심판 배정)
  teams: Team[];
  matches: Match[];
  tournament: { slots: { cat: Category; slotNo: number; teamId: string | null }[]; games: TournamentGame[] };
};

// useRealtime.ts 와 같은 규칙: 개발 중에는 접속한 호스트의 :4000
const serverUrl = () => process.env.NEXT_PUBLIC_REALTIME_URL ?? `${location.protocol}//${location.hostname}:4000`;

const REFRESH_MS = 10_000;

// 여러 컴포넌트가 쓰는 모듈 단일 캐시. 구독자가 있을 때만 폴로 갱신한다.
// snapshot 은 참조가 바뀔 때만 교체해야 useSyncExternalStore 가 무한 렌더링하지 않는다.
type ContestSnapshot = { config: ContestConfig | null; failed: boolean };
let snapshot: ContestSnapshot = { config: null, failed: false };
const listeners = new Set<() => void>();
let interval: ReturnType<typeof setInterval> | null = null;
let inflight: Promise<void> | null = null;

function setSnapshot(next: ContestSnapshot) {
  if (next.config === snapshot.config && next.failed === snapshot.failed) return;
  snapshot = next;
  for (const l of listeners) l();
}

async function fetchConfig(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(`${serverUrl()}/config`, { credentials: 'include', cache: 'no-store' });
      // 로그인 전(401) 이나 서버 끊김: 마지막 캐시를 유지하고 실패만 표시한다
      if (!res.ok) {
        setSnapshot({ config: snapshot.config, failed: true });
        return;
      }
      const data = (await res.json()) as { ok: boolean; config?: ContestConfig };
      if (data.ok && data.config) setSnapshot({ config: data.config, failed: false });
      else setSnapshot({ config: snapshot.config, failed: true });
    } catch {
      setSnapshot({ config: snapshot.config, failed: true });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  void fetchConfig();
  if (!interval) {
    interval = setInterval(() => {
      if (!document.hidden) void fetchConfig();
    }, REFRESH_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && interval) {
      clearInterval(interval);
      interval = null;
    }
  };
}

export function useContest() {
  const { config, failed } = useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
  // loaded: 한 번이라도 받아온 적 있음 / failed: 마지막 요청 실패 (둘이 같이 false 이면 로딩 중)
  return { config, loaded: config !== null, failed };
}

// 관리자가 저장한 뒤 즉시 반영하고 싶을 때 (설정 탭 저장 등) 캐시를 무효화한다.
export const refreshContest = () => fetchConfig();

// 서버가 허용하는 테이블 번호 범위와 같은 기본값
export const TABLES = [1, 2, 3, 4, 5, 6, 7, 8];

// 대진에 실제 쓰이는 테이블 번호. 대진이 아직 없으면 기본값(TABLES)을 쓴다.
export const tablesOf = (matches: Match[]) => {
  const used = [...new Set(matches.map((m) => m.table))].sort((a, b) => a - b);
  return used.length > 0 ? used : TABLES;
};

// 순위판 표시용. 목록에 없는 ID 는 그대로 보여준다.
export const teamName = (teams: Team[], id: string) => teams.find((t) => t.id === id)?.name ?? id;
export const teamOf = (teams: Team[], id: string) => teams.find((t) => t.id === id);
export const matchesOfTable = (matches: Match[], table: number) => matches.filter((m) => m.table === table);
