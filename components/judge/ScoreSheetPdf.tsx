'use client';

import { forwardRef } from 'react';
import type { Match, Team } from '@/lib/contest';
import { calc, CATEGORY_NAMES, MISSION_NAMES, PRE_CHECKS, type Item, type Mission } from '@/lib/judge/rules';
import type { Sheet } from '@/lib/judge/sheets';

type Props = {
  judgeId: string;
  judgeName: string;
  match: Match;
  team: Team;
  sheet: Sheet;
  ruleItems: Item[];
};

const MISSIONS: Mission[] = ['M1', 'M2', 'PEN'];

export const ScoreSheetPdf = forwardRef<HTMLDivElement, Props>(function ScoreSheetPdf(
  { judgeId, judgeName, match, team, sheet, ruleItems },
  ref,
) {
  const score = calc(sheet.values, match.cat, ruleItems);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed left-[-10000px] top-0 w-[760px] bg-white p-8 text-[12px] leading-snug text-black">
      <div ref={ref} className="bg-white p-1">
        <div className="flex items-end justify-between border-b-2 border-black pb-2">
          <div>
            <h1 className="text-xl font-extrabold">2026 로보틱스 챌린지 · 점수표</h1>
            <p className="mt-1 text-[13px]">
              {CATEGORY_NAMES[match.cat]} · {match.label ?? `${match.round}차 조별 라운드`} · {match.table}조 · {match.wave} 테이블
            </p>
          </div>
          <p className="text-right text-gray-500">
            심판: <b className="text-black">{judgeName}</b> ({judgeId})
            <br />채점 확인: {new Date().toLocaleString('ko-KR')}
          </p>
        </div>

        <div className="mt-3 flex gap-6">
          <p>팀: <b>{team.id} · {team.name}</b></p>
          <p>소속: <b>{team.org || '-'}</b></p>
        </div>

        <table className="mt-3 w-full border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-400 px-2 py-1 text-left">채점 항목</th>
              <th className="w-16 border border-gray-400 px-2 py-1 text-center">기록</th>
              <th className="w-16 border border-gray-400 px-2 py-1 text-right">점수</th>
            </tr>
          </thead>
          <tbody>
            {MISSIONS.map((mission) => (
              <FragmentRows key={mission} mission={mission} score={score} />
            ))}
            <tr className="bg-gray-100 text-base font-extrabold">
              <td colSpan={2} className="border border-gray-400 px-2 py-1">총점{score.dq ? ' (실격)' : ''}</td>
              <td className="border border-gray-400 px-2 py-1 text-right tabular-nums">{score.total}</td>
            </tr>
          </tbody>
        </table>

        <p className="mt-2 text-[11px] text-gray-600">
          사전 확인: {PRE_CHECKS.map(([key, label]) => `${label} ${sheet.pre[key] ? '✓' : '✗'}`).join(' · ')}
        </p>
        <p className="mt-1 text-[11px] text-gray-600">
          리셋 {Number(sheet.values.resets) || 0}회 · 종료 {sheet.values.endTime || 120}초
          {sheet.values.note ? ` · 비고: ${sheet.values.note}` : ''}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="rounded border border-gray-500 p-2">
            <p className="text-[11px] font-bold text-gray-500">심판 서명</p>
            {sheet.refSig
              ? <img src={sheet.refSig} alt="심판 서명" className="h-[72px] object-contain" />
              : <p className="flex h-[72px] items-center text-gray-400">서명 없음</p>}
            <p className="mt-1 text-[11px]">{judgeName} · {sheet.refSignedAt ? new Date(sheet.refSignedAt).toLocaleString('ko-KR') : '-'}</p>
          </div>
          <div className="rounded border border-gray-500 p-2">
            <p className="text-[11px] font-bold text-gray-500">참가팀 대표 서명</p>
            {sheet.teamSig
              ? <img src={sheet.teamSig} alt="참가팀 대표 서명" className="h-[72px] object-contain" />
              : <p className="flex h-[72px] items-center text-gray-400">{sheet.signException ? `서명 예외: ${sheet.signException}` : '서명 없음'}</p>}
            <p className="mt-1 text-[11px]">{sheet.teamSigner ?? team.members[0] ?? '-'} · {sheet.teamSignedAt ? new Date(sheet.teamSignedAt).toLocaleString('ko-KR') : '-'}</p>
          </div>
        </div>
      </div>
    </div>
  );
});

function FragmentRows({ mission, score }: { mission: Mission; score: ReturnType<typeof calc> }) {
  const rows = score.lines.filter((line) => line.it.m === mission);
  return (
    <>
      <tr className="bg-gray-50 font-bold">
        <td colSpan={2} className="border border-gray-400 px-2 py-1">{MISSION_NAMES[mission]}</td>
        <td className="border border-gray-400 px-2 py-1 text-right tabular-nums">{score.sum[mission]}</td>
      </tr>
      {rows.map((line) => (
        <tr key={line.it.id}>
          <td className="border border-gray-400 px-2 py-1">{line.it.label}</td>
          <td className="border border-gray-400 px-2 py-1 text-center tabular-nums">
            {line.it.type === 'manual' ? '-' : line.it.type === 'bool' ? (line.q ? '예' : '아니오') : line.q}
          </td>
          <td className="border border-gray-400 px-2 py-1 text-right tabular-nums">{line.sub}</td>
        </tr>
      ))}
    </>
  );
}

export async function downloadScoreSheetPdf(node: HTMLDivElement, match: Match, team: Team) {
  const [{ toPng }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
  const png = await toPng(node, { pixelRatio: 2, backgroundColor: '#ffffff' });
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 12;
  const pageWidth = pdf.internal.pageSize.getWidth() - margin * 2;
  const pageHeight = pdf.internal.pageSize.getHeight() - margin * 2;
  const ratio = node.offsetHeight / node.offsetWidth;
  const width = Math.min(pageWidth, pageHeight / ratio);
  pdf.addImage(png, 'PNG', margin, margin, width, width * ratio);
  const safe = (value: string) => value.replace(/[\\/:*?"<>|]/g, '-');
  const gameLabel = match.label ?? `${match.round}차 경기`;
  pdf.save(`${safe(team.name)}-${safe(gameLabel).replace(/\s+/g, '-')}.pdf`);
}
