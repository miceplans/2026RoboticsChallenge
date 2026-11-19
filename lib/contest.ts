'use client';

// 서버 /config 를 받아오는 클라이언트 데이터 레이어.
// lib/judge/data.ts 의 정적 TEAMS/MATCHES 를 대체한다 (관리자가 서버에서 바꾸는 값이므로).
import { useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Category } from './judge/rules';

export type Team = { id: string; cat: Category; code: string; name: string; region: string; org: string; coach: string; members: string[] };
// label 은 토너먼트 경기를 같은 채점 화면으로 채점할 때 쓰는 이름 (예: '8강 1경기'). 조별 라운드는 비어 있다.
// table = 조 번호(1~8), wave = A/B 테이블. 컬럼 이름은 예전 스키마 그대로다.
export type Match = { id: string; round: 1 | 2; cat: Category; wave: 'A' | 'B'; table: number; field: '좌' | '우'; team: string; label?: string };
export type Notice = { message: string; updatedAt: number };
// 순위(서버 /standings, /leaderboard). 부문(cat) 안에서 최고점 → 1차+2차 합 → 감점 → 팀 ID 순.
// r1/r2 는 각 라운드 확정 최고점 (1R→2R 흐름 표시용, 없으면 null).
export type Standing = { teamId: string; teamName: string; teamOrg: string | null; total: number; cat: Category; sum: number; pen: number; r1: number | null; r2: number | null };
export type TournamentRound = 'QF' | 'SF' | 'F' | '3P';
export type TournamentGame = {
  cat: Category;
  round: TournamentRound;
  gameNo: number;
  teamA: string | null;
  teamB: string | null;
  scoreA: number | null;
  scoreB: number | null;
  winner: string | null;
  status: 'scheduled' | 'done';
  updatedAt?: number;
};

// 심판이 제출한 토너먼트 경기 점수 (관리자가 칸별로 확정하기 전까지는 결과가 아니다)
export type TournamentSubmission = { cat: Category; round: TournamentRound; gameNo: number; scoreA: number; scoreB: number; judgeId: string; ts: number };

// 끝난 경기에서 패했지만 이후 라운드에 배정된 경기가 없는 팀만 탈락으로 본다.
// 준결승 패자는 3·4위전에 배정되므로, 그 경기가 끝날 때까지는 탈락 처리하지 않는다.
const TOURNAMENT_STAGE: Record<TournamentRound, number> = { QF: 1, SF: 2, F: 3, '3P': 3 };
export function eliminatedTeamIds(cat: Category, games: TournamentGame[]): Set<string> {
  const categoryGames = games.filter((game) => game.cat === cat);
  const eliminated = new Set<string>();

  for (const game of categoryGames) {
    if (game.status !== 'done' || !game.winner) continue;
    const loser = game.winner === game.teamA ? game.teamB : game.teamA;
    if (!loser) continue;
    const advances = categoryGames.some(
      (next) => TOURNAMENT_STAGE[next.round] > TOURNAMENT_STAGE[game.round] && (next.teamA === loser || next.teamB === loser),
    );
    if (!advances) eliminated.add(loser);
  }
  return eliminated;
}
// 진행 단계 잠금 (서버 getProgress). 부문별로 1차 → 2차 → 토너먼트 순서를 서버가 강제한다.
export type RoundProgress = { total: number; submitted: number; confirmed: number };
export type CatProgress = { r1: RoundProgress; r2: RoundProgress; round2Open: boolean; tournamentOpen: boolean };
export type ContestConfig = {
  updatedAt: number;
  settings: {
    autoConfirm: boolean;
    boardPublic: boolean;
    notice: Notice;
    tableOrder?: number[]; // 구버전 설정 (더 이상 쓰지 않음 — 진행 순서는 조 번호로 고정)
    rankOrder: Partial<Record<Category, string[]>>; // 관리자 순위 조정 (없으면 계산 순위)
  };
  template: unknown; // null 이면 lib/judge/rules.ts 기본 항목 사용
  teams: Team[];
  matches: Match[];
  tournament: { slots: { cat: Category; slotNo: number; teamId: string | null }[]; games: TournamentGame[]; submissions?: TournamentSubmission[] };
  progress?: Record<Category, CatProgress>; // 구버전 서버 응답에는 없음 — 없으면 잠그지 않는다
  // 로봇 승인서 결과 (팀 ID → pass|fail). 심판·관리자는 전 팀, 참가자는 자기 팀 결과만 제공된다.
  homologation?: Record<string, 'pass' | 'fail'>;
};

// 토너먼트는 예선 순위 상위 8팀이 8강부터 시작한다.
export const SEED_ORDER = [1, 8, 4, 5, 2, 7, 3, 6]; // 8팀 표준 시드: 1v8, 4v5 / 2v7, 3v6

// 조별 라운드 배정: DB 의 matches 한 줄 = (라운드, 부문, 조 1~8, A/B 테이블, 팀).
// 기존 컬럼을 그대로 쓴다 — table = 조 번호, wave = A/B 테이블, field 는 A→좌·B→우 (하위 호환용).
export const GROUPS = [1, 2, 3, 4, 5, 6, 7, 8];
export const SIDES = ['A', 'B'] as const;
export type Side = (typeof SIDES)[number];
export const fieldOfSide = (side: Side): '좌' | '우' => (side === 'A' ? '좌' : '우');
// "주니어 3조 · A" (부문을 빼면 "3조 · A")
export const slotLabel = (m: Pick<Match, 'cat' | 'table' | 'wave'>, withCat = true) =>
  `${withCat ? `${m.cat === 'J' ? '주니어' : '시니어'} ` : ''}${m.table}조 · ${m.wave}`;

// 당일 진행 순서: 라운드마다 주니어 1조 → 시니어 1조 → 주니어 2조 → … → 시니어 8조 (16경기).
// 한 경기 = 한 조의 A·B 두 팀이 동시에 치르는 것. game 은 라운드 안의 경기 순서(1~16), seq 는 전체 줄 순번.
export type ScheduledMatch = Match & { seq: number; game: number };
export const gameNoOf = (m: Pick<Match, 'cat' | 'table'>) => (m.table - 1) * 2 + (m.cat === 'J' ? 1 : 2);
export function computeSchedule(matches: Match[]): ScheduledMatch[] {
  return [...matches]
    .sort((a, b) => a.round - b.round || gameNoOf(a) - gameNoOf(b) || a.wave.localeCompare(b.wave) || (a.team < b.team ? -1 : 1))
    .map((m, i) => ({ ...m, seq: i + 1, game: gameNoOf(m) }));
}

// 부문 순위. 동점 = 최고점(total)이 같음 → 같은 순위 번호를 공유하고, 다음 순위는 건너뛰지 않는다 (1,2,2,3,4…).
// 동점 팀끼리의 표시 순서는 1차+2차 점수 합이 큰 팀이 위 → 감점 적은 순 → 팀 ID.
export type RankedStanding = Standing & { rank: number; tied: boolean };

export const roundSum = (s: Pick<Standing, 'r1' | 'r2'>) => (s.r1 ?? 0) + (s.r2 ?? 0);

// 서버의 전송 순서에 의존하지 않고, 실시간 점수 변경 직후에도 화면에서 다시 정렬한다.
export function compareStandings(a: Standing, b: Standing) {
  return b.total - a.total || roundSum(b) - roundSum(a) || a.pen - b.pen || a.teamId.localeCompare(b.teamId);
}

// 이미 compareStandings 로 정렬된 목록에 공동 순위(dense)를 붙인다.
export function assignRanks<T extends Standing>(rows: T[]): (T & { rank: number; tied: boolean })[] {
  let rank = 0;
  return rows.map((s, i) => {
    if (i === 0 || rows[i - 1].total !== s.total) rank += 1;
    const tied = (i > 0 && rows[i - 1].total === s.total) || (i + 1 < rows.length && rows[i + 1].total === s.total);
    return { ...s, rank, tied };
  });
}

export function withRanks(standings: Standing[], cat: Category): RankedStanding[] {
  return assignRanks(standings.filter((s) => s.cat === cat).sort(compareStandings));
}

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
let socket: Socket | null = null;
let refreshQueued = false;

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
      // 요청 중에 소켓 알림을 받으면 해당 요청이 이전 설정을 읽었을 수 있다.
      // 한 번 더 읽어 이벤트 시점의 최신 공지를 보장한다.
      if (refreshQueued) {
        refreshQueued = false;
        void fetchConfig();
      }
    }
  })();
  return inflight;
}

function refreshFromServerEvent() {
  if (inflight) {
    refreshQueued = true;
    return;
  }
  void fetchConfig();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  void fetchConfig();
  if (!interval) {
    interval = setInterval(() => {
      if (!document.hidden) void fetchConfig();
    }, REFRESH_MS);
  }
  if (!socket) {
    socket = io(serverUrl(), { withCredentials: true });
    // 설정 변경은 서버가 즉시 알린다. 공지 전용 이벤트도 지원해, 서버와 클라이언트의
    // 설정 이벤트가 잠시 엇갈리더라도 최신 설정을 다시 읽는다.
    socket.on('config', refreshFromServerEvent);
    socket.on('notice', refreshFromServerEvent);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      socket?.disconnect();
      socket = null;
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

// 순위판 표시용. 목록에 없는 ID 는 그대로 보여준다.
export const teamName = (teams: Team[], id: string) => teams.find((t) => t.id === id)?.name ?? id;
export const teamOf = (teams: Team[], id: string) => teams.find((t) => t.id === id);
