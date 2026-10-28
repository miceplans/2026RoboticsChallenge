'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Match } from './data';
import { calc, type Values } from './rules';

// 작성 중인 채점지. 심판 기기(localStorage)에 자동 저장되어 새로고침/끊김에도 사라지지 않는다.
// 서명까지 마치면(signed) 서버로 제출하고, 제출 상태(전송 대기/저장됨)는 realtime 쪽 기록이 관리한다.
export type SheetStatus = 'draft' | 'reviewing' | 'signed';
export type Sheet = {
  status: SheetStatus;
  values: Values;
  pre: Record<string, boolean>;
  updated: number;
  refSig?: string;
  refSignedAt?: number;
  teamSig?: string;
  teamSigner?: string;
  teamSignedAt?: number;
  signException?: string;
  signedAt?: number;
};

export const newSheet = (): Sheet => ({ status: 'draft', values: {}, pre: {}, updated: Date.now() });

const storeKey = (judgeId: string) => `judge-sheets:${judgeId}`;

export function useSheets(judgeId: string) {
  const [sheets, setSheets] = useState<Record<string, Sheet>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setSheets(JSON.parse(localStorage.getItem(storeKey(judgeId)) ?? '{}'));
    } catch {}
    setReady(true);
  }, [judgeId]);

  // 불러오기가 끝나기 전에 빈 값으로 덮어쓰지 않도록 ready 이후에만 저장
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(storeKey(judgeId), JSON.stringify(sheets));
    } catch {}
  }, [sheets, ready, judgeId]);

  const update = useCallback(
    (matchId: string, fn: (s: Sheet) => Sheet) =>
      setSheets((all) => ({ ...all, [matchId]: { ...fn(all[matchId] ?? newSheet()), updated: Date.now() } })),
    [],
  );

  return { sheets, ready, update };
}

// 서버에 함께 저장할 채점지 (관리자 확인·PDF·정정 이력 등에 쓰인다)
export function sheetPayload(match: Match, sheet: Sheet) {
  const c = calc(sheet.values, match.cat);
  return {
    category: match.cat,
    round: match.round,
    table: match.table,
    wave: match.wave,
    field: match.field,
    values: sheet.values,
    pre: sheet.pre,
    sum: c.sum,
    total: c.total,
    refSig: sheet.refSig,
    refSignedAt: sheet.refSignedAt,
    teamSig: sheet.teamSig,
    teamSigner: sheet.teamSigner,
    teamSignedAt: sheet.teamSignedAt,
    signException: sheet.signException,
    signedAt: sheet.signedAt,
  };
}
