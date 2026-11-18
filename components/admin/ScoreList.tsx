'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/Toast';
import { teamName, useContest, type TournamentRound } from '@/lib/contest';
import { calc, CATEGORY_NAMES, ITEMS, MISSION_NAMES, parseTemplate, PRE_CHECKS, type Category, type Item, type Mission, type Values } from '@/lib/judge/rules';
import { adminFetch, btn, btnPrimary, card, downloadCsv, fmtDate, Icon, STATUS_LABEL, timeAgo } from './shared';

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

const TOURNAMENT_ROUND_LABEL: Record<string, string> = { QF: '8강', SF: '4강', F: '결승', '3P': '3·4위전' };

function pdfGameLabel(matchId: string, round: number | null) {
  const tournament = /^T:[JS]:(QF|SF|F|3P):(\d+):[AB]$/.exec(matchId);
  if (tournament) return `${TOURNAMENT_ROUND_LABEL[tournament[1]]}-${tournament[2]}경기`;
  return round ? `${round}차-경기` : matchId;
}

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
            {CATEGORY_NAMES[cat]} · {row.round ?? '-'}차 경기{row.table ? ` · ${row.table}조` : ''}{row.wave ? ` · ${row.wave} 테이블` : ''}
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

// 채점 한 건의 확인서를 보여주고 그대로 PDF 파일로 내려받는 모달
function ScoreSheetModal({ score, items, onClose }: { score: ScoreRow; items: Item[]; onClose: () => void }) {
  const toast = useToast();
  const [row, setRow] = useState<SheetRow | null | undefined>(undefined); // undefined = 불러오는 중, null = 채점지 없음
  const [busy, setBusy] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const q = new URLSearchParams({ matchId: score.matchId, teamId: score.teamId, judgeId: score.judgeId });
    adminFetch<{ sheets: SheetRow[] }>(`/admin/scores/sheets?${q.toString()}`)
      .then((d) => alive && setRow(d.sheets[0] ?? null))
      .catch((e: Error) => {
        if (!alive) return;
        toast(e.message);
        setRow(null);
      });
    return () => {
      alive = false;
    };
  }, [score, toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const download = async () => {
    if (!sheetRef.current || !row) return;
    setBusy(true);
    try {
      const [{ toPng }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
      const node = sheetRef.current;
      const png = await toPng(node, { pixelRatio: 2, backgroundColor: '#ffffff' });
      const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
      const margin = 12;
      const pageW = pdf.internal.pageSize.getWidth() - margin * 2;
      const pageH = pdf.internal.pageSize.getHeight() - margin * 2;
      const ratio = node.offsetHeight / node.offsetWidth;
      const w = Math.min(pageW, pageH / ratio);
      pdf.addImage(png, 'PNG', margin, margin, w, w * ratio);
      const safe = (value: string) => value.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '-');
      const gameLabel = pdfGameLabel(row.matchId, row.round);
      pdf.save(`${safe(row.teamName ?? row.teamId)}-${safe(gameLabel)}.pdf`);
    } catch (e) {
      toast(`PDF 생성 실패: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="채점 확인서" className={`${card} flex max-h-[90vh] w-full max-w-[860px] flex-col p-5`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-extrabold text-heading">채점 확인서 <span className="ml-1 text-sm font-normal text-gray-400">{score.matchId} · {score.teamId} · {score.judgeId}</span></h2>
          <button className="rounded-full p-1 text-gray-500 hover:bg-gray-100" onClick={onClose} aria-label="닫기"><Icon name="close" /></button>
        </div>
        <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-xl border border-line bg-gray-50 p-3">
          {row === undefined && <p className="py-10 text-center text-gray-400">불러오는 중…</p>}
          {row === null && <p className="py-10 text-center text-gray-400">서명된 채점지가 없어 PDF를 만들 수 없습니다.</p>}
          {row && (
            <div ref={sheetRef} className="mx-auto w-[760px] bg-white p-6">
              <ScoreSheetPage row={row} items={items} />
            </div>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className={btn} onClick={onClose}>닫기</button>
          <button className={`${btnPrimary} disabled:opacity-50`} onClick={download} disabled={!row || busy}>
            <span className="inline-flex items-center gap-1"><Icon name="download" />{busy ? '만드는 중…' : 'PDF 다운로드'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

const SCORE_FILTERS = [
  { id: '', label: '전체 상태' },
  { id: 'pending', label: '확정 대기' },
  { id: 'confirmed', label: '확정' },
  { id: 'modified', label: '수정됨' },
  { id: 'rejected', label: '반려' },
];

const ROUND_TABS = [
  { id: '1', label: '1차 라운드' },
  { id: '2', label: '2차 라운드' },
  { id: 'final', label: '본선' },
] as const;

const FINAL_ROUND_TABS: { id: TournamentRound; label: string }[] = [
  { id: 'QF', label: '8강' },
  { id: 'SF', label: '4강' },
  { id: 'F', label: '결승' },
  { id: '3P', label: '3·4위전' },
];

const FINAL_STATUS_FILTERS = [
  { id: '', label: '전체 상태' },
  { id: 'pending', label: '미확정' },
  { id: 'confirmed', label: '확정' },
];

export default function ScoreList() {
  const toast = useToast();
  const { config } = useContest();
  const teams = config?.teams ?? [];
  const [round, setRound] = useState<'1' | '2' | 'final'>('1');
  const [finalRound, setFinalRound] = useState<TournamentRound>('QF');
  const [filter, setFilter] = useState('');
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pdfCat, setPdfCat] = useState('');
  const [pdfRound, setPdfRound] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [printRows, setPrintRows] = useState<SheetRow[] | null>(null);
  const [selected, setSelected] = useState<ScoreRow | null>(null);
  const printAreaRef = useRef<HTMLDivElement>(null);
  const previousTitle = useRef<string | null>(null);
  const items = parseTemplate(config?.template) ?? ITEMS;

  useEffect(() => {
    if (round === 'final') return;
    let alive = true;
    const q = new URLSearchParams({ round });
    if (filter) q.set('status', filter);
    adminFetch<{ scores: ScoreRow[]; total: number }>(`/admin/scores?${q.toString()}`)
      .then((d) => {
        if (!alive) return;
        setRows(d.scores);
        setTotal(d.total);
      })
      .catch((e: Error) => toast(e.message));
    return () => {
      alive = false;
    };
  }, [filter, round, toast]);

  const tournamentGames = (config?.tournament.games ?? [])
    .filter((game) => game.round === finalRound)
    .filter((game) => !filter || (filter === 'confirmed' ? game.status === 'done' : game.status !== 'done'));
  const tournamentSubmission = (cat: 'J' | 'S', gameNo: number) =>
    config?.tournament.submissions?.find((submission) => submission.cat === cat && submission.round === finalRound && submission.gameNo === gameNo);

  // 인쇄 대화상자가 닫히면 인쇄 영역을 비운다
  useEffect(() => {
    if (!printRows) return;
    const done = () => {
      if (previousTitle.current !== null) document.title = previousTitle.current;
      previousTitle.current = null;
      setPrintRows(null);
    };
    window.addEventListener('afterprint', done, { once: true });
    return () => window.removeEventListener('afterprint', done);
  }, [printRows]);

  // 데이터가 바뀐 직후에는 React가 인쇄 DOM을 아직 반영하지 않았거나 서명 이미지·웹폰트가
  // 준비되지 않았을 수 있다. 실제 인쇄 영역이 모두 준비된 다음 프린트 미리보기를 연다.
  useEffect(() => {
    if (!printRows) return;
    let cancelled = false;

    const printWhenReady = async () => {
      const area = printAreaRef.current;
      if (!area) return;

      await document.fonts?.ready;
      const images = Array.from(area.querySelectorAll('img'));
      await Promise.all(images.map((image) => image.decode().catch(() => undefined)));
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

      if (!cancelled) {
        setPdfBusy(false);
        window.print();
      }
    };

    void printWhenReady();
    return () => {
      cancelled = true;
    };
  }, [printRows]);

  // 게임(부문·차수)별 채점 확인서를 인쇄한다 — 브라우저 인쇄 대화상자에서 'PDF로 저장'을 고륾면 PDF 다운로드가 된다
  const exportPdf = async () => {
    setPdfBusy(true);
    try {
      const q = new URLSearchParams();
      if (pdfCat) q.set('cat', pdfCat);
      if (pdfRound) q.set('round', pdfRound);
      const d = await adminFetch<{ sheets: SheetRow[] }>(`/admin/scores/sheets?${q.toString()}`);
      if (d.sheets.length === 0) {
        setPdfBusy(false);
        return toast('선택한 게임에 서명된 채점지가 없습니다.');
      }
      previousTitle.current = document.title;
      const categoryLabel = pdfCat === 'J' ? '주니어' : pdfCat === 'S' ? '시니어' : '전체부문';
      const roundLabel = pdfRound ? `${pdfRound}차` : '전체경기';
      document.title = `점수표-${categoryLabel}-${roundLabel}`;
      setPrintRows(d.sheets);
    } catch (e) {
      toast((e as Error).message);
      setPdfBusy(false);
    }
  };

  const exportCsv = () => {
    if (round === 'final') {
      const label = FINAL_ROUND_TABS.find((item) => item.id === finalRound)?.label ?? finalRound;
      const header = ['라운드', '경기', '부문', '팀 A', '팀 B', '점수 A', '점수 B', '심판', '상태', '제출시각'];
      const body = tournamentGames.map((game) => {
        const submission = tournamentSubmission(game.cat, game.gameNo);
        return [
          label,
          `${game.gameNo}경기`,
          game.cat === 'J' ? '주니어' : '시니어',
          game.teamA ? `${game.teamA} · ${teamName(teams, game.teamA)}` : '',
          game.teamB ? `${game.teamB} · ${teamName(teams, game.teamB)}` : '',
          game.status === 'done' ? (game.scoreA ?? '') : (submission?.scoreA ?? ''),
          game.status === 'done' ? (game.scoreB ?? '') : (submission?.scoreB ?? ''),
          submission?.judgeId ?? '',
          game.status === 'done' ? '확정' : '미확정',
          submission ? new Date(submission.ts).toLocaleString('ko-KR') : '',
        ];
      });
      downloadCsv(`scores-final-${finalRound}-${filter || 'all'}-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
      return;
    }
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
    downloadCsv(`scores-round-${round}-${filter || 'all'}-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
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
          <button className={btn} onClick={exportCsv}><span className="inline-flex items-center gap-1"><Icon name="download" />CSV 내보내기</span></button>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-b border-line">
        <div className="flex gap-1" role="tablist" aria-label="라운드 선택">
          {ROUND_TABS.map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={round === x.id}
              onClick={() => {
                setRound(x.id);
                setFilter('');
              }}
              className={`border-b-2 px-5 py-3 text-sm font-semibold transition-colors ${round === x.id ? 'border-accent text-accent' : 'border-transparent text-gray-500 hover:border-line-hover hover:text-gray-700'}`}
            >
              {x.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 pb-2">
          <label htmlFor="score-status-filter" className="text-sm font-medium text-gray-600">상태</label>
          <select
            id="score-status-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-2xl border border-line bg-white px-3 py-2 text-sm text-gray-700"
          >
            {(round === 'final' ? FINAL_STATUS_FILTERS : SCORE_FILTERS).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </div>
      </div>
      {round === 'final' && (
        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="본선 라운드 선택">
          {FINAL_ROUND_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={finalRound === item.id}
              onClick={() => setFinalRound(item.id)}
              className={`rounded-2xl border px-4 py-2 text-sm font-semibold ${finalRound === item.id ? 'border-accent bg-accent text-white' : 'border-line text-gray-600 hover:border-line-hover'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      <div className="mt-3 flex justify-end">
        <span className="ml-auto text-xs text-gray-400">총 {round === 'final' ? tournamentGames.length : total}건{round !== 'final' && total > rows.length ? ` (처음 ${rows.length}건 표시)` : ''}</span>
      </div>
      <div className="mt-5 overflow-x-auto rounded-xl border border-line">
        {round === 'final' ? (
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="bg-accent text-white">
              <tr>
                <th className="px-4 py-3 font-semibold">경기</th>
                <th className="px-4 py-3 font-semibold">부문</th>
                <th className="px-4 py-3 font-semibold">팀 A</th>
                <th className="px-4 py-3 font-semibold">팀 B</th>
                <th className="px-4 py-3 text-center font-semibold">점수</th>
                <th className="px-4 py-3 font-semibold">심판</th>
                <th className="px-4 py-3 font-semibold">상태</th>
                <th className="px-4 py-3 font-semibold">제출</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tournamentGames.map((game) => {
                const submission = tournamentSubmission(game.cat, game.gameNo);
                const scoreA = game.status === 'done' ? game.scoreA : submission?.scoreA;
                const scoreB = game.status === 'done' ? game.scoreB : submission?.scoreB;
                return (
                  <tr key={`${game.cat}/${game.round}/${game.gameNo}`}>
                    <td className="px-4 py-3 font-medium">{game.gameNo}경기</td>
                    <td className="px-4 py-3">{game.cat === 'J' ? '주니어' : '시니어'}</td>
                    <td className="px-4 py-3">{game.teamA ? `${game.teamA} · ${teamName(teams, game.teamA)}` : '-'}</td>
                    <td className="px-4 py-3">{game.teamB ? `${game.teamB} · ${teamName(teams, game.teamB)}` : '-'}</td>
                    <td className="px-4 py-3 text-center font-semibold tabular-nums">{scoreA != null && scoreB != null ? `${scoreA} : ${scoreB}` : '-'}</td>
                    <td className="px-4 py-3">{submission?.judgeId ?? '-'}</td>
                    <td className={`px-4 py-3 ${game.status === 'done' ? 'text-accent' : 'text-gray-600'}`}>{game.status === 'done' ? '확정' : '미확정'}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{submission ? timeAgo(submission.ts) : '-'}</td>
                  </tr>
                );
              })}
              {tournamentGames.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">선택한 본선 라운드와 상태에 해당하는 경기가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        ) : (
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
                <td className="px-4 py-3 text-right tabular-nums">
                  <button className="font-semibold text-accent underline-offset-2 hover:underline" onClick={() => setSelected(r)} title="채점 확인서 보기 · PDF 다운로드">{r.points}</button>
                </td>
                <td className="px-4 py-3 text-gray-600">{STATUS_LABEL[r.status] ?? r.status}</td>
                <td className="px-4 py-3 text-xs text-gray-400">{timeAgo(r.ts)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">선택한 라운드와 상태에 해당하는 채점이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
        )}
      </div>
      {printRows && (
        <div ref={printAreaRef} className="print-area">
          {printRows.map((row) => (
            <ScoreSheetPage key={`${row.matchId}/${row.teamId}/${row.judgeId}`} row={row} items={items} />
          ))}
        </div>
      )}
      {selected && <ScoreSheetModal score={selected} items={items} onClose={() => setSelected(null)} />}
    </section>
  );
}
