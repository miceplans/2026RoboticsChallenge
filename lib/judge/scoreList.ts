'use client';

import { useCallback, useEffect, useState } from 'react';
import { MATCHES, teamOf, TEAMS } from './data';

export type ScoreRow = { matchId: string; teamId: string; judgeId: string; points: number; ts: number; refName: string | null; signException: string | null };

const serverUrl = () => process.env.NEXT_PUBLIC_REALTIME_URL ?? `${location.protocol}//${location.hostname}:4000`;

// 서버에 실제로 저장된 채점 결과만 불러온다 (관리자 전용).
export function useScoreList() {
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${serverUrl()}/scores`, { credentials: 'include' });
      if (!res.ok) throw new Error('request failed');
      setRows(((await res.json()) as { scores: ScoreRow[] }).scores);
      setState('ok');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 10_000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  return { rows, state, refresh };
}

// 라운드 정렬: 주니어 1조~8조(A,B) → 시니어 1조~8조(A,B). 주니어·시니어를 번갈아 늘어놓지 않는다.
export function describe(row: ScoreRow) {
  const m = MATCHES.find((x) => x.id === row.matchId);
  const team = TEAMS.some((t) => t.id === row.teamId) ? teamOf(row.teamId) : null;
  return {
    round: m?.round ?? 0,
    senior: (m?.cat ?? team?.cat) === 'S',
    cat: m ? (m.cat === 'S' ? '시니어' : '주니어') : '-',
    no: Number(row.teamId.replace(/\D/g, '')) || 0,
    wave: m?.wave ?? '',
    table: m ? `테이블 ${m.table}` : '-',
    team: team ? `${team.id} · ${team.name}` : row.teamId,
  };
}

export const byRoundOrder = (a: ScoreRow, b: ScoreRow) => {
  const x = describe(a);
  const y = describe(b);
  return x.round - y.round || Number(x.senior) - Number(y.senior) || x.no - y.no || x.wave.localeCompare(y.wave);
};
