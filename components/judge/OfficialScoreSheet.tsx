'use client';

import type { Ref } from 'react';
import { ScoreSheetPdf } from '@/components/judge/ScoreSheetPdf';
import type { Match, Team } from '@/lib/contest';
import type { Item, Values } from '@/lib/judge/rules';
import type { Sheet } from '@/lib/judge/sheets';

// 서버가 저장한 채점지 원본(listSheets 행)을 공식 점수표 양식으로 그린다. 관리자 채점 목록과 참가자 '내 점수표'가 함께 쓴다.

export type SheetPayload = {
  values?: Values;
  pre?: Record<string, boolean>;
  total?: number;
  refSig?: string;
  refSignedAt?: number;
  teamSig?: string;
  teamSigner?: string;
  teamSignedAt?: number;
  signException?: string;
  signedAt?: number;
};

export type SheetRow = {
  matchId: string;
  teamId: string;
  teamName: string | null;
  members: string[];
  judgeId: string;
  judgeName: string | null;
  round: number | null;
  cat: 'J' | 'S' | null;
  wave: string | null;
  table: number | null;
  field: string | null;
  points: number;
  status: string;
  ts: number;
  sheet: SheetPayload | null;
};

const TOURNAMENT_ROUND_LABEL: Record<string, string> = { QF: '8강', SF: '4강', F: '결승', '3P': '3·4위전' };

export function officialSheetProps(row: SheetRow) {
  const tournament = /^T:[JS]:(QF|SF|F|3P):(\d+):([AB])$/.exec(row.matchId);
  const cat = row.cat ?? 'J';
  const match: Match = {
    id: row.matchId,
    round: row.round === 2 ? 2 : 1,
    cat,
    wave: row.wave === 'B' ? 'B' : 'A',
    table: row.table ?? 0,
    field: row.field === '우' ? '우' : '좌',
    team: row.teamId,
    label: tournament ? `${TOURNAMENT_ROUND_LABEL[tournament[1]]} ${tournament[2]}경기` : undefined,
  };
  const team: Team = {
    id: row.teamId,
    cat,
    code: row.teamId,
    name: row.teamName ?? row.teamId,
    region: '',
    org: '',
    coach: '',
    members: row.members,
  };
  const payload = row.sheet ?? {};
  const sheet: Sheet = {
    status: 'signed',
    values: payload.values ?? {},
    pre: payload.pre ?? {},
    updated: row.ts,
    refSig: payload.refSig,
    refSignedAt: payload.refSignedAt,
    teamSig: payload.teamSig,
    teamSigner: payload.teamSigner,
    teamSignedAt: payload.teamSignedAt,
    signException: payload.signException,
    signedAt: payload.signedAt,
  };
  return { match, team, sheet };
}

export function OfficialScoreSheet({ row, items, sheetRef }: { row: SheetRow; items: Item[]; sheetRef?: Ref<HTMLDivElement> }) {
  const { match, team, sheet } = officialSheetProps(row);
  return (
    <div className="print-sheet">
      <ScoreSheetPdf
        ref={sheetRef}
        mode="inline"
        judgeId={row.judgeId}
        judgeName={row.judgeName ?? row.judgeId}
        match={match}
        team={team}
        sheet={sheet}
        ruleItems={items}
      />
    </div>
  );
}
