'use client';

import { useEffect, useState } from 'react';
import ReviewView from '@/components/judge/ReviewView';
import ScoreTable from '@/components/judge/ScoreTable';
import ScoreView from '@/components/judge/ScoreView';
import SignView from '@/components/judge/SignView';
import { btnGhost, btnPrimary, Card, Chip, inputCls, type Tone } from '@/components/judge/ui';
import { StatusBadge } from '@/components/LiveLeaderboard';
import { MATCHES, matchesOfTable, TABLES, teamOf, type Match } from '@/lib/judge/data';
import { calc, CATEGORY_NAMES } from '@/lib/judge/rules';
import { newSheet, sheetPayload, useSheets, type Sheet } from '@/lib/judge/sheets';
import { useRobotApproval } from '@/lib/judge/robotApproval';
import { scoreKey } from '@/lib/realtime/outbox';
import { useRealtime } from '@/lib/realtime/useRealtime';

type Mode = 'score' | 'review' | 'sign' | 'done';

// REF03 같은 계정은 해당 테이블에 고정, 그 외(데모/관리자)는 직접 고른다
const fixedTable = (judgeId: string) => {
  const t = /^REF0?([1-8])$/i.exec(judgeId)?.[1];
  return t ? Number(t) : null;
};

type Props = { judgeId: string; judgeName: string };

// 경기 목록 행에 관리자가 승인한 로봇을 보여준다. 채점표에는 넣지 않는다.
function ApprovalBadge({ teamId }: { teamId: string }) {
  const { approval } = useRobotApproval(teamId);
  const ids = approval?.approvedRobotIds ?? [];
  if (ids.length === 0) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap items-center gap-1 align-middle">
      <b className="text-accent">✓ {ids.length}대 승인 완료</b>
      {ids.map((id) => <span key={id} className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-bold text-accent">{id}</span>)}
    </span>
  );
}

// 저장·PDF 출력처럼 잠깐 걸리는 작업 동안 승인표 화면과 같은 '처리중' 표시를 띄운다.
export default function JudgeConsole(props: Props) {
  const [busy, setBusy] = useState(false);
  return (
    <>
      <JudgeConsoleBody {...props} setBusy={setBusy} />
      {busy && (
        <div role="status" aria-live="polite" className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 print:hidden">
          <div className="rounded-2xl bg-white px-8 py-6 text-center shadow-lg">
            <div className="mx-auto size-8 animate-spin rounded-full border-4 border-line border-t-accent" />
            <p className="mt-3 font-bold">처리중</p>
          </div>
        </div>
      )}
    </>
  );
}

const MIN_BUSY_MS = 700;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function JudgeConsoleBody({ judgeId, judgeName, setBusy }: Props & { setBusy: (b: boolean) => void }) {
  const { status, history, pending, rejected, submitScore, resendAll } = useRealtime();
  const { sheets, update } = useSheets(judgeId);

  const fixed = fixedTable(judgeId);
  const [picked, setPicked] = useState(1);
  useEffect(() => {
    try {
      const t = Number(localStorage.getItem('judge-table'));
      if (TABLES.includes(t)) setPicked(t);
    } catch {}
  }, []);
  const table = fixed ?? picked;

  const [openId, setOpenId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('score');
  const [step, setStep] = useState<0 | 1>(0);

  // 확정된 경기를 고칠 때의 작업 사본. 뒤로 가면 버리므로 확정 점수는 그대로 남는다.
  const [draft, setDraft] = useState<Sheet | null>(null);

  const match = MATCHES.find((m) => m.id === openId) ?? null;
  const stored = match ? (sheets[match.id] ?? newSheet()) : null;
  const sheet = draft ?? stored;

  // 서버 제출 상태: 전송 대기 / 서버 저장됨 / 거부됨
  const syncOf = (m: Match) => history.find((h) => scoreKey(h) === scoreKey({ matchId: m.id, teamId: m.team }))?.status;
  const syncLabel = (m: Match): [string, Tone] => {
    const s = syncOf(m);
    return s === 'acked' ? ['서버 저장됨', 'info'] : s === 'rejected' ? ['거부됨', 'bad'] : ['전송 대기', 'warn'];
  };

  const open = (m: Match) => {
    const s = sheets[m.id];
    setOpenId(m.id);
    setStep(0);
    setDraft(null);
    setMode(s?.status === 'signed' ? 'done' : 'score');
    if (!s) update(m.id, (x) => x);
    window.scrollTo(0, 0);
  };
  const close = () => setOpenId(null);

  // 확인·서명 중에 점수를 고치면 작성 중으로 되돌리고, 받아둔 서명은 무효로 한다
  const invalidate = (s: Sheet): Sheet => (s.status === 'reviewing' ? { ...s, status: 'draft', refSig: undefined, refSignedAt: undefined, refName: undefined, teamSig: undefined } : s);

  // 수정 중이면 작업 사본을, 아니면 저장된 채점지를 고친다
  const patch = (fn: (s: Sheet) => Sheet) => (draft ? setDraft((d) => (d ? { ...fn(d), updated: Date.now() } : d)) : update(match!.id, fn));
  const edit = (fn: (s: Sheet) => Sheet) => patch((s) => invalidate(fn(s)));

  // 확정된 채점을 불러와 수정 시작: 서명은 모두 다시 받는다
  const revise = () => {
    setDraft({ ...sheet!, status: 'draft', refSig: undefined, refSignedAt: undefined, refName: undefined, teamSig: undefined, teamSigner: undefined, teamSignedAt: undefined, signException: undefined, signedAt: undefined, updated: Date.now() });
    setStep(0);
    setMode('score');
    window.scrollTo(0, 0);
  };
  const cancelRevise = () => {
    setDraft(null);
    setMode('done');
    window.scrollTo(0, 0);
  };

  const finish = async (p: Partial<Sheet>) => {
    setBusy(true);
    try {
      const signed: Sheet = { ...sheet!, ...p, status: 'signed', signedAt: Date.now() };
      update(match!.id, () => signed);
      submitScore(match!.id, match!.team, calc(signed.values, match!.cat).total, sheetPayload(match!, signed));
      await wait(MIN_BUSY_MS);
      setDraft(null);
      setMode('done');
      window.scrollTo(0, 0);
    } finally {
      setBusy(false);
    }
  };

  const printPdf = async () => {
    setBusy(true);
    await wait(MIN_BUSY_MS);
    setBusy(false);
    await wait(50); // 오버레이가 사라진 뒤에 인쇄 창을 연다
    window.print();
  };

  if (!match || !sheet) {
    return (
      <main className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-bold text-accent">테이블 {table}</p>
            <h1 className="mt-1 text-3xl font-extrabold">담당 경기</h1>
            <p className="mt-2 text-sm text-gray-500">채점을 시작할 경기를 선택하십시오.</p>
          </div>
          {fixed === null && (
            <label className="text-sm text-gray-500">
              담당 테이블
              <select
                className={`${inputCls} ml-2`}
                value={table}
                onChange={(e) => {
                  setPicked(Number(e.target.value));
                  try {
                    localStorage.setItem('judge-table', e.target.value);
                  } catch {}
                }}
              >
                {TABLES.map((t) => <option key={t} value={t}>{t}번</option>)}
              </select>
            </label>
          )}
        </div>

        {([1, 2] as const).map((round) => (
          <Card key={round} title={`${round}차 조별 라운드`}>
            <div className="space-y-1 p-3">
              {matchesOfTable(table)
                .filter((m) => m.round === round)
                .sort((a, b) => a.wave.localeCompare(b.wave) || (a.field === b.field ? 0 : a.field === '좌' ? -1 : 1))
                .map((m) => {
                  const t = teamOf(m.team);
                  const s = sheets[m.id];
                  const [text, tone]: [string, Tone] =
                    !s ? ['미입력', 'neutral']
                    : s.status === 'draft' ? ['작성 중', 'warn']
                    : s.status === 'reviewing' ? ['확인·서명 중', 'warn']
                    : syncLabel(m);
                  return (
                    <button key={m.id} type="button" onClick={() => open(m)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left transition-colors hover:bg-surface">
                      <Chip tone={m.cat === 'S' ? 'info' : 'neutral'}>{CATEGORY_NAMES[m.cat]}</Chip>
                      <span className="flex-1">
                        <b className="block">{m.wave}조 · {m.field}</b>
                        <small className="text-gray-500">{t.id} {t.name} · {t.org}{' '}<ApprovalBadge teamId={t.id} /></small>
                      </span>
                      {s?.status === 'signed' && <b>{calc(s.values, m.cat).total}점</b>}
                      <Chip tone={tone}>{text}</Chip>
                      <span>›</span>
                    </button>
                  );
                })}
            </div>
          </Card>
        ))}

        <Card title="서버 동기화">
          <div className="space-y-2 px-5 py-4 text-sm">
            <StatusBadge status={status} />
            <p className="text-gray-600">
              {pending > 0 ? `전송 대기 ${pending}건 · 연결되면 자동 전송됩니다` : '서명을 마친 점수는 모두 서버에 저장되었습니다'}
            </p>
            {rejected && <p className="text-error">{rejected}</p>}
            {/* 서버 데이터를 복구한 뒤, 이 기기에 남은 기록을 모두 다시 보낸다 */}
            <button
              type="button"
              className="text-gray-600 underline"
              onClick={() => confirm('이 기기에 저장된 모든 점수를 서버로 다시 보냅니다. 서버 데이터를 복구한 뒤에 사용하십시오.') && resendAll()}
            >
              저장된 점수 전체 재전송
            </button>
          </div>
        </Card>
      </main>
    );
  }

  const team = teamOf(match.team);

  if (mode === 'review') {
    return <ReviewView match={match} team={team} sheet={sheet} onEdit={() => setMode('score')} onSign={() => { setStep(0); setMode('sign'); }} />;
  }

  if (mode === 'sign') {
    return (
      <SignView
        match={match}
        team={team}
        sheet={sheet}
        judgeName={judgeName}
        step={step}
        onRefSigned={(p) => { patch((s) => ({ ...s, ...p })); setStep(1); }}
        onFinish={finish}
        onBack={() => setMode('review')}
      />
    );
  }

  // 확정된 경기: 먼저 조회만 하고, 맨 아래 '수정하기'로 기존 채점을 불러와 고친다
  if (mode === 'done') {
    const sync = syncOf(match);
    const [syncText] = syncLabel(match);
    const c = calc(sheet.values, match.cat);
    return (
      <main className="mx-auto max-w-3xl rounded-2xl border border-line bg-white p-6">
        <button type="button" onClick={close} className="mb-4 text-sm font-bold">← 담당 경기 목록</button>
        <div className="text-center">
          <div className="text-5xl text-accent">✓</div>
          <h1 className="mt-4 text-2xl font-extrabold">{sync === 'acked' ? '관리자에게 전달했습니다' : sync === 'rejected' ? '서버가 거부했습니다' : '이 기기에 저장했습니다'}</h1>
          <p className="mt-2 text-sm text-gray-500">
            {team.id} {team.name} · {match.round}차 · 총점 <b>{c.total}점</b>
            {sheet.signException && ` · 서명 예외: ${sheet.signException}`}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {sync === 'acked' ? syncText : sync === 'rejected' ? '운영본부에 알려 주십시오' : '연결되면 자동으로 전송됩니다 (전송 대기)'}
          </p>
        </div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2" data-score-print>
          <ScoreTable values={sheet.values} cat={match.cat} />
          <div>
            <div className="rounded-2xl bg-accent/10 p-6 text-center">
              <small className="text-gray-600">총점</small>
              <p className="mt-2 text-6xl font-extrabold text-accent">{c.total}</p>
              <p className="mt-3 text-xs text-gray-600">미션1 {c.sum.M1} · 미션2 {c.sum.M2} · 일반 벌점 {c.sum.PEN}</p>
            </div>
            <div className="mt-4 flex gap-6">
              {sheet.refSig && (
                <div>
                  <p className="text-xs text-gray-500">심판 {sheet.refName ?? judgeName}</p>
                  <img src={sheet.refSig} alt="심판 서명" className="mt-1 h-[70px] rounded-lg border border-line bg-white" />
                </div>
              )}
              {sheet.teamSig && (
                <div>
                  <p className="text-xs text-gray-500">참가팀 대표 {sheet.teamSigner}</p>
                  <img src={sheet.teamSig} alt="참가팀 대표 서명" className="mt-1 h-[70px] rounded-lg border border-line bg-white" />
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={close} className={btnGhost}>다음 경기로</button>
          <button type="button" onClick={printPdf} className={btnGhost}>채점표 PDF 출력</button>
          <button type="button" onClick={revise} className={btnPrimary}>수정하기</button>
        </div>
        <p className="mt-3 text-right text-xs text-gray-500">수정하면 심판과 팀 대표의 서명을 다시 받은 뒤에 서버에 반영합니다.</p>
      </main>
    );
  }

  return (
    <ScoreView
      match={match}
      team={team}
      sheet={sheet}
      edit={edit}
      onBack={draft ? cancelRevise : close}
      backLabel={draft ? '← 수정 취소 (기존 점수 유지)' : undefined}
      onReview={() => { patch((s) => ({ ...s, status: 'reviewing' })); setMode('review'); window.scrollTo(0, 0); }}
    />
  );
}
