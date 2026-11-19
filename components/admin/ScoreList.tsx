'use client';

import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/Toast';
import { downloadScoreSheetPdf, downloadScoreSheetsPdf } from '@/components/judge/ScoreSheetPdf';
import { officialSheetProps, OfficialScoreSheet, type SheetRow } from '@/components/judge/OfficialScoreSheet';
import { teamName, useContest, type TournamentRound } from '@/lib/contest';
import { ITEMS, parseTemplate, type Item } from '@/lib/judge/rules';
import { adminFetch, btn, btnPrimary, card, downloadCsv, Icon, STATUS_LABEL, timeAgo } from './shared';

type ScoreRow = { matchId: string; teamId: string; judgeId: string; points: number; ts: number; status: string; cat: 'J' | 'S' | null };

function ForceEditModal({ score, onClose, onSaved }: { score: ScoreRow; onClose: () => void; onSaved: (points: number) => void }) {
  const toast = useToast();
  const [points, setPoints] = useState(String(score.points));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextPoints = Number(points);
    if (!Number.isFinite(nextPoints)) return toast('수정할 점수를 입력해 주세요.');
    if (!reason.trim()) return toast('강제 수정 사유를 입력해 주세요.');
    setBusy(true);
    try {
      await adminFetch('/admin/scores/modify', {
        method: 'POST',
        body: { matchId: score.matchId, teamId: score.teamId, judgeId: score.judgeId, points: nextPoints, reason: reason.trim() },
      });
      toast('점수가 강제 수정되었습니다.');
      onSaved(nextPoints);
    } catch (error) {
      toast((error as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && onClose()}>
      <form role="dialog" aria-modal="true" aria-label="점수 강제 수정" className={`${card} w-full max-w-md p-6`} onSubmit={save} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-extrabold text-heading">점수 강제 수정</h2>
          <button type="button" className="rounded-full p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-50" onClick={onClose} disabled={busy} aria-label="닫기"><Icon name="close" /></button>
        </div>
        <p className="mt-2 text-sm text-gray-500">{score.matchId} · {score.teamId} · 심판 {score.judgeId}</p>
        <div className="mt-5 space-y-4">
          <label className="block text-sm font-semibold text-gray-700">
            총점
            <input type="number" step="any" value={points} onChange={(e) => setPoints(e.target.value)} autoFocus required className="mt-1 w-full rounded-xl border border-line px-3 py-2 font-normal tabular-nums" />
          </label>
          <label className="block text-sm font-semibold text-gray-700">
            수정 사유 <span className="text-red-500">*</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} required placeholder="수정 사유를 입력하세요 (감사 로그에 기록됩니다)" className="mt-1 w-full resize-none rounded-xl border border-line px-3 py-2 font-normal" />
          </label>
        </div>
        <p className="mt-3 text-xs text-amber-700">원본 서명 채점지는 변경되지 않으며, 수정된 총점은 즉시 순위에 반영됩니다.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={btn} onClick={onClose} disabled={busy}>취소</button>
          <button type="submit" className={`${btnPrimary} disabled:opacity-50`} disabled={busy}>{busy ? '수정 중…' : '강제 수정'}</button>
        </div>
      </form>
    </div>
  );
}

// --- 점수표 PDF (게임별 채점 확인서 인쇄) ---

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
      const { match, team } = officialSheetProps(row);
      await downloadScoreSheetPdf(sheetRef.current, match, team);
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
            <div className="mx-auto w-[794px] bg-white">
              <OfficialScoreSheet row={row} items={items} sheetRef={sheetRef} />
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

// 경기 ID → 회차 그룹(1차·2차·8강·4강·3·4위전·결승). 정렬 순서도 이 배열을 따른다.
const STAGES = [
  { id: '1', label: '1차 라운드' },
  { id: '2', label: '2차 라운드' },
  { id: 'QF', label: '본선 8강' },
  { id: 'SF', label: '본선 4강' },
  { id: '3P', label: '본선 3·4위전' },
  { id: 'F', label: '본선 결승' },
] as const;

function stageOf(row: SheetRow): string {
  const tournament = /^T:[JS]:(QF|SF|F|3P):/.exec(row.matchId);
  if (tournament) return tournament[1];
  if (row.round === 2 || row.matchId.startsWith('R2')) return '2';
  return '1';
}

// 팀 이름을 누르면 그 팀의 1차·2차·본선 채점 확인서를 모두 보여 주고, 건별·회차별·전체 PDF로 내려받는 모달
function TeamResultsModal({ teamId, items, onClose }: { teamId: string; items: Item[]; onClose: () => void }) {
  const toast = useToast();
  const { config } = useContest();
  const name = teamName(config?.teams ?? [], teamId);
  const [rows, setRows] = useState<SheetRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const nodes = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    let alive = true;
    adminFetch<{ sheets: SheetRow[] }>(`/admin/scores/sheets?${new URLSearchParams({ teamId }).toString()}`)
      .then((d) => alive && setRows(d.sheets))
      .catch((e: Error) => {
        if (!alive) return;
        toast(e.message);
        setRows([]);
      });
    return () => {
      alive = false;
    };
  }, [teamId, toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const keyOf = (row: SheetRow) => `${row.matchId}/${row.judgeId}`;
  const groups = STAGES.map((stage) => ({ ...stage, rows: (rows ?? []).filter((row) => stageOf(row) === stage.id) })).filter((g) => g.rows.length > 0);

  const download = async (id: string, list: SheetRow[], fileLabel: string) => {
    const targets = list.map((row) => nodes.current.get(keyOf(row))).filter((node): node is HTMLDivElement => !!node);
    if (targets.length === 0) return;
    setBusy(id);
    try {
      await downloadScoreSheetsPdf(targets, `${name}-${fileLabel}`);
    } catch (e) {
      toast(`PDF 생성 실패: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const pdfButton = (id: string, list: SheetRow[], fileLabel: string, label: string, primary = false) => (
    <button className={`${primary ? btnPrimary : btn} !py-1.5 disabled:opacity-50`} onClick={() => download(id, list, fileLabel)} disabled={busy !== null}>
      <span className="inline-flex items-center gap-1"><Icon name="download" />{busy === id ? '만드는 중…' : label}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`${name} 경기 결과`} className={`${card} flex max-h-[90vh] w-full max-w-[900px] flex-col p-5`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-extrabold text-heading">{name} <span className="ml-1 text-sm font-normal text-gray-400">{teamId} · 전체 경기 결과</span></h2>
          <div className="flex items-center gap-2">
            {rows && rows.length > 0 && pdfButton('all', groups.flatMap((g) => g.rows), '전체경기', '전체 PDF', true)}
            <button className="rounded-full p-1 text-gray-500 hover:bg-gray-100" onClick={onClose} aria-label="닫기"><Icon name="close" /></button>
          </div>
        </div>
        {groups.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {groups.map((g) => (
              <a key={g.id} href={`#team-stage-${g.id}`} className="rounded-2xl border border-line px-3 py-1 text-xs font-semibold text-gray-600 hover:border-line-hover">
                {g.label} <span className="text-accent tabular-nums">{g.rows.map((r) => r.points).join(' / ')}</span>
              </a>
            ))}
          </div>
        )}
        <div className="mt-4 min-h-0 flex-1 space-y-6 overflow-auto rounded-xl border border-line bg-gray-50 p-3">
          {rows === null && <p className="py-10 text-center text-gray-400">불러오는 중…</p>}
          {rows && rows.length === 0 && <p className="py-10 text-center text-gray-400">서명된 채점지가 없습니다.</p>}
          {groups.map((g) => (
            <section key={g.id} id={`team-stage-${g.id}`} className="space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-line pb-2">
                <h3 className="text-lg font-bold text-heading">{g.label}</h3>
                {pdfButton(g.id, g.rows, g.label, `${g.label} PDF`)}
              </div>
              {g.rows.map((row) => (
                <div key={keyOf(row)} className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-gray-600">
                      <span className="text-xs text-gray-400">{row.matchId}</span> · 심판 {row.judgeName ?? row.judgeId} · <b className="tabular-nums text-heading">{row.points}점</b> · {STATUS_LABEL[row.status] ?? row.status}
                    </span>
                    {pdfButton(keyOf(row), [row], `${g.label}-${row.judgeName ?? row.judgeId}`, 'PDF')}
                  </div>
                  <div className="mx-auto w-[794px] bg-white">
                    <OfficialScoreSheet
                      row={row}
                      items={items}
                      sheetRef={(node) => {
                        if (node) nodes.current.set(keyOf(row), node);
                        else nodes.current.delete(keyOf(row));
                      }}
                    />
                  </div>
                </div>
              ))}
            </section>
          ))}
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
  const [editing, setEditing] = useState<ScoreRow | null>(null);
  const [teamOpen, setTeamOpen] = useState<string | null>(null);
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

  const teamButton = (id: string) => (
    <button type="button" className="text-left font-medium underline-offset-2 hover:text-accent hover:underline" onClick={() => setTeamOpen(id)} title="이 팀의 전체 경기 결과 보기">
      {id} · {teamName(teams, id)}
    </button>
  );

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
                    <td className="px-4 py-3">{game.teamA ? teamButton(game.teamA) : '-'}</td>
                    <td className="px-4 py-3">{game.teamB ? teamButton(game.teamB) : '-'}</td>
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
              <th className="px-4 py-3 text-center font-semibold">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={`${r.matchId}/${r.teamId}/${r.judgeId}`}>
                <td className="px-4 py-3">{r.matchId.startsWith('R1') ? '1차' : '2차'} <span className="text-xs text-gray-400">{r.matchId}</span></td>
                <td className="px-4 py-3 font-medium">{teamButton(r.teamId)}</td>
                <td className="px-4 py-3">{r.cat === 'J' ? '주니어' : r.cat === 'S' ? '시니어' : '-'}</td>
                <td className="px-4 py-3">{r.judgeId}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{r.points}</td>
                <td className="px-4 py-3 text-gray-600">{STATUS_LABEL[r.status] ?? r.status}</td>
                <td className="px-4 py-3 text-xs text-gray-400">{timeAgo(r.ts)}</td>
                <td className="px-4 py-3 text-center">
                  <div className="flex justify-center gap-1">
                    <button className={`${btn} !px-3 !py-1.5`} onClick={() => setSelected(r)}>확인서</button>
                    <button className={`${btn} !px-3 !py-1.5 text-red-600`} onClick={() => setEditing(r)}>강제 수정</button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">선택한 라운드와 상태에 해당하는 채점이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
        )}
      </div>
      {printRows && (
        <div ref={printAreaRef} className="print-area">
          {printRows.map((row) => (
            <OfficialScoreSheet key={`${row.matchId}/${row.teamId}/${row.judgeId}`} row={row} items={items} />
          ))}
        </div>
      )}
      {teamOpen && <TeamResultsModal teamId={teamOpen} items={items} onClose={() => setTeamOpen(null)} />}
      {selected && <ScoreSheetModal score={selected} items={items} onClose={() => setSelected(null)} />}
      {editing && (
        <ForceEditModal
          score={editing}
          onClose={() => setEditing(null)}
          onSaved={(points) => {
            setRows((current) => current.map((row) => row.matchId === editing.matchId && row.teamId === editing.teamId && row.judgeId === editing.judgeId ? { ...row, points, status: 'modified' } : row));
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}
