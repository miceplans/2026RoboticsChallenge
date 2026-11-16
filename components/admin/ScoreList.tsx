'use client';

import { Fragment, useEffect, useState } from 'react';
import { useToast } from '@/components/Toast';
import { teamName, useContest } from '@/lib/contest';
import { calc, CATEGORY_NAMES, ITEMS, MISSION_NAMES, parseTemplate, PRE_CHECKS, type Category, type Item, type Mission, type Values } from '@/lib/judge/rules';
import { adminFetch, btn, card, downloadCsv, fmtDate, Icon, STATUS_LABEL, timeAgo } from './shared';

type ScoreRow = { matchId: string; teamId: string; judgeId: string; points: number; ts: number; status: string; cat: 'J' | 'S' | null };

// --- 점수표 PDF (게임별 채점 확인서 인쇄) ---

type SheetPayload = {
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

type SheetRow = {
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

function ScoreSheetPage({ row, items }: { row: SheetRow; items: Item[] }) {
  const cat: Category = row.cat ?? 'J';
  const sheet = row.sheet ?? {};
  const c = calc(sheet.values ?? {}, cat, items);
  const leader = row.members[0] ?? '-';
  const missions: Mission[] = ['M1', 'M2', 'PEN'];
  const cell = 'border border-gray-400 px-2 py-1 text-left';
  const qty = (it: Item, q: number | null) => (it.type === 'count' ? (q ?? 0) : (q ?? 0) > 0 ? 'O' : 'X');

  return (
    <div className="print-sheet bg-white text-[12px] leading-snug text-black">
      <div className="flex items-end justify-between border-b-2 border-black pb-2">
        <div>
          <h1 className="text-xl font-extrabold">2026 로보틱스 챌린지 · 채점 확인서</h1>
          <p className="mt-1 text-[13px]">
            {CATEGORY_NAMES[cat]} · {row.round ?? '-'}차 경기{row.wave ? ` · 웨이브 ${row.wave}` : ''}{row.table ? ` · 테이블 ${row.table}` : ''}{row.field ? ` · ${row.field}필드` : ''}
            <span className="ml-2 text-gray-500">{row.matchId}</span>
          </p>
        </div>
        <p className="text-right text-gray-500">
          심판: <b className="text-black">{row.judgeName ?? row.judgeId}</b> <span className="text-gray-400">{row.judgeId}</span>
          <br />제출: {fmtDate(row.ts)} · {STATUS_LABEL[row.status] ?? row.status}
        </p>
      </div>

      <div className="mt-2 flex gap-6">
        <p>팀: <b>{row.teamId}{row.teamName ? ` · ${row.teamName}` : ''}</b></p>
        <p>팀장: <b>{leader}</b></p>
        <p>서명자: <b>{sheet.teamSigner ?? '-'}</b></p>
      </div>

      <table className="mt-2 w-full border-collapse">
        <thead>
          <tr className="bg-gray-100">
            <th className={`${cell} font-semibold`}>채점 항목</th>
            <th className={`${cell} w-12 text-center font-semibold`}>개수</th>
            <th className={`${cell} w-12 text-right font-semibold`}>배점</th>
            <th className={`${cell} w-14 text-right font-semibold`}>점수</th>
          </tr>
        </thead>
        <tbody>
          {missions.map((m) => (
            <Fragment key={m}>
              <tr className="bg-gray-50">
                <td colSpan={3} className={`${cell} font-bold`}>{MISSION_NAMES[m]}</td>
                <td className={`${cell} text-right font-bold tabular-nums`}>{c.sum[m]}</td>
              </tr>
              {c.lines.filter((l) => l.it.m === m).map((l) => (
                <tr key={l.it.id}>
                  <td className={cell}>{l.it.label}</td>
                  <td className={`${cell} text-center tabular-nums`}>{l.it.type === 'manual' ? '-' : qty(l.it, l.q)}</td>
                  <td className={`${cell} text-right tabular-nums`}>{l.it.type === 'manual' ? '-' : l.p}</td>
                  <td className={`${cell} text-right tabular-nums`}>{l.sub}</td>
                </tr>
              ))}
            </Fragment>
          ))}
          <tr className="bg-gray-100">
            <td colSpan={3} className={`${cell} text-base font-extrabold`}>총점{c.dq ? ' (실격)' : ''}</td>
            <td className={`${cell} text-right text-base font-extrabold tabular-nums`}>{sheet.total ?? c.total}</td>
          </tr>
        </tbody>
      </table>

      {sheet.pre && (
        <p className="mt-1 text-[11px] text-gray-600">
          사전 확인: {PRE_CHECKS.map(([k, label]) => `${label} ${sheet.pre?.[k] ? '✓' : '✗'}`).join(' · ')}
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-4">
        <div className="rounded border border-gray-500 p-2">
          <p className="text-[11px] font-bold text-gray-500">심판 서명</p>
          {sheet.refSig
            ? <img src={sheet.refSig} alt="심판 서명" className="h-[72px] object-contain" />
            : <p className="flex h-[72px] items-center text-gray-400">서명 없음</p>}
          <p className="mt-1 text-[11px]">{row.judgeName ?? row.judgeId} · {fmtDate(sheet.refSignedAt)}</p>
        </div>
        <div className="rounded border border-gray-500 p-2">
          <p className="text-[11px] font-bold text-gray-500">팀장 서명</p>
          {sheet.teamSig
            ? <img src={sheet.teamSig} alt="팀장 서명" className="h-[72px] object-contain" />
            : <p className="flex h-[72px] items-center text-gray-400">{sheet.signException ? `서명 예외: ${sheet.signException}` : '서명 없음'}</p>}
          <p className="mt-1 text-[11px]">{sheet.teamSigner ?? leader} · {fmtDate(sheet.teamSignedAt)}</p>
        </div>
      </div>
    </div>
  );
}

const SCORE_FILTERS = [
  { id: '', label: '전체' },
  { id: 'pending', label: '확정 대기' },
  { id: 'confirmed', label: '확정' },
  { id: 'modified', label: '수정됨' },
  { id: 'rejected', label: '반려' },
];

export default function ScoreList() {
  const toast = useToast();
  const { config } = useContest();
  const teams = config?.teams ?? [];
  const [filter, setFilter] = useState('');
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pdfCat, setPdfCat] = useState('');
  const [pdfRound, setPdfRound] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [printRows, setPrintRows] = useState<SheetRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    adminFetch<{ scores: ScoreRow[]; total: number }>(`/admin/scores${filter ? `?status=${filter}` : ''}`)
      .then((d) => {
        if (!alive) return;
        setRows(d.scores);
        setTotal(d.total);
      })
      .catch((e: Error) => toast(e.message));
    return () => {
      alive = false;
    };
  }, [filter, toast]);

  // 인쇄 대화상자가 닫히면 인쇄 영역을 비운다
  useEffect(() => {
    if (!printRows) return;
    const done = () => setPrintRows(null);
    window.addEventListener('afterprint', done, { once: true });
    return () => window.removeEventListener('afterprint', done);
  }, [printRows]);

  // 게임(부문·차수)별 채점 확인서를 인쇄한다 — 브라우저 인쇄 대화상자에서 'PDF로 저장'을 고륾면 PDF 다운로드가 된다
  const exportPdf = async () => {
    setPdfBusy(true);
    try {
      const q = new URLSearchParams();
      if (pdfCat) q.set('cat', pdfCat);
      if (pdfRound) q.set('round', pdfRound);
      const d = await adminFetch<{ sheets: SheetRow[] }>(`/admin/scores/sheets?${q.toString()}`);
      if (d.sheets.length === 0) return toast('선택한 게임에 서명된 채점지가 없습니다.');
      setPrintRows(d.sheets);
      setTimeout(() => window.print(), 100);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setPdfBusy(false);
    }
  };

  const exportCsv = () => {
    const header = ['경기ID', '라운드', '팀ID', '팀명', '부문', '심판', '총점', '상태', '제출시각'];
    const body = rows.map((r) => [
      r.matchId,
      r.matchId.startsWith('R1') ? '1차' : '2차',
      r.teamId,
      teamName(teams, r.teamId),
      r.cat === 'J' ? '주니어' : r.cat === 'S' ? '시니어' : '',
      r.judgeId,
      r.points,
      STATUS_LABEL[r.status] ?? r.status,
      new Date(r.ts).toLocaleString('ko-KR'),
    ]);
    downloadCsv(`scores-${filter || 'all'}-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
  };

  return (
    <section className={`${card} p-6`}>
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold text-heading">채점 목록</h1>
        <div className="flex flex-wrap items-center gap-2">
          <select value={pdfCat} onChange={(e) => setPdfCat(e.target.value)} aria-label="PDF 부문" className="rounded-2xl border border-line bg-white px-2 py-2 text-sm">
            <option value="">전체 부문</option>
            <option value="J">주니어</option>
            <option value="S">시니어</option>
          </select>
          <select value={pdfRound} onChange={(e) => setPdfRound(e.target.value)} aria-label="PDF 차수" className="rounded-2xl border border-line bg-white px-2 py-2 text-sm">
            <option value="">전체 차수</option>
            <option value="1">1차</option>
            <option value="2">2차</option>
          </select>
          <button className={btn} onClick={exportPdf} disabled={pdfBusy} title="브라우저 인쇄 대화상자에서 'PDF로 저장'을 선택하세요">
            <span className="inline-flex items-center gap-1"><Icon name="picture_as_pdf" />{pdfBusy ? '준비 중…' : '점수표 PDF'}</span>
          </button>
          <button className={btn} onClick={exportCsv}><span className="inline-flex items-center gap-1"><Icon name="download" />CSV 내돔내기</span></button>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {SCORE_FILTERS.map((x) => (
          <button key={x.id} onClick={() => setFilter(x.id)} className={`rounded-2xl border px-3 py-1.5 text-sm ${filter === x.id ? 'border-accent bg-accent text-white' : 'border-line text-gray-600 hover:border-line-hover'}`}>{x.label}</button>
        ))}
        <span className="ml-auto text-xs text-gray-400">총 {total}건{total > rows.length ? ` (처음 ${rows.length}건 표시)` : ''}</span>
      </div>
      <div className="mt-5 overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="bg-accent text-white">
            <tr>
              <th className="px-4 py-3 font-semibold">라운드</th>
              <th className="px-4 py-3 font-semibold">참가팀</th>
              <th className="px-4 py-3 font-semibold">부문</th>
              <th className="px-4 py-3 font-semibold">심판</th>
              <th className="px-4 py-3 text-right font-semibold">총점</th>
              <th className="px-4 py-3 font-semibold">상태</th>
              <th className="px-4 py-3 font-semibold">제출</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={`${r.matchId}/${r.teamId}/${r.judgeId}`}>
                <td className="px-4 py-3">{r.matchId.startsWith('R1') ? '1차' : '2차'} <span className="text-xs text-gray-400">{r.matchId}</span></td>
                <td className="px-4 py-3 font-medium">{r.teamId} · {teamName(teams, r.teamId)}</td>
                <td className="px-4 py-3">{r.cat === 'J' ? '주니어' : r.cat === 'S' ? '시니어' : '-'}</td>
                <td className="px-4 py-3">{r.judgeId}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.points}</td>
                <td className="px-4 py-3 text-gray-600">{STATUS_LABEL[r.status] ?? r.status}</td>
                <td className="px-4 py-3 text-xs text-gray-400">{timeAgo(r.ts)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">해당 상태의 채점이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {printRows && (
        <div className="print-area">
          {printRows.map((row) => (
            <ScoreSheetPage key={`${row.matchId}/${row.teamId}/${row.judgeId}`} row={row} items={parseTemplate(config?.template) ?? ITEMS} />
          ))}
        </div>
      )}
    </section>
  );
}
