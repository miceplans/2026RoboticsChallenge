'use client';

import { useEffect, useMemo, useState } from 'react';
import ReviewView from '@/components/judge/ReviewView';
import ScoreView from '@/components/judge/ScoreView';
import SignView from '@/components/judge/SignView';
import { useToast } from '@/components/Toast';
import { btnPrimary, Card, Chip, inputCls, type Tone } from '@/components/judge/ui';
import { StatusBadge } from '@/components/LiveLeaderboard';
import { matchesOfTable, tablesOf, teamOf, useContest, type Match } from '@/lib/contest';
import { calc, CATEGORY_NAMES, ITEMS, parseTemplate, type Item } from '@/lib/judge/rules';
import { newSheet, sheetPayload, useSheets, type Sheet } from '@/lib/judge/sheets';
import { scoreKey } from '@/lib/realtime/outbox';
import { useRealtime } from '@/lib/realtime/useRealtime';

type Mode = 'score' | 'review' | 'sign' | 'done';

// REF03 같은 계정은 해당 테이블에 고정, 그 외(데모/관리자)는 직접 고른다
const fixedTable = (judgeId: string) => {
  const t = /^REF0?([1-8])$/i.exec(judgeId)?.[1];
  return t ? Number(t) : null;
};

export default function JudgeConsole({ judgeId, judgeName }: { judgeId: string; judgeName: string }) {
  const { status, history, pending, rejected, submitScore, resendAll } = useRealtime();
  const { config, failed } = useContest();
  const matches = config?.matches ?? [];
  const teams = config?.teams ?? [];
  // 관리자가 저장한 채점표 템플릿이 있으면 그것을 쓰고, 없거나 형식이 이상하면 기본 규칙 항목표를 쓴다
  const ruleItems = useMemo<Item[]>(() => parseTemplate(config?.template) ?? ITEMS, [config?.template]);
  const { sheets, update } = useSheets(judgeId);
  const toast = useToast();

  // 서버가 점수를 거부한 사유는 화면에 적지 않고 토스트로 알린다
  useEffect(() => {
    if (rejected) toast(rejected);
  }, [rejected, toast]);

  const fixed = fixedTable(judgeId) ?? config?.judgeTables[judgeId] ?? null;
  const tables = tablesOf(matches);
  const [picked, setPicked] = useState(1);
  useEffect(() => {
    try {
      const t = Number(localStorage.getItem('judge-table'));
      if (tables.includes(t)) setPicked(t);
    } catch {}
  }, [config?.matches]);
  const table = fixed ?? picked;

  const [openId, setOpenId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('score');
  const [step, setStep] = useState<0 | 1>(0);

  const match = matches.find((m) => m.id === openId) ?? null;
  const sheet = match ? (sheets[match.id] ?? newSheet()) : null;

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
    setMode(s?.status === 'signed' ? 'done' : 'score');
    if (!s) update(m.id, (x) => x);
    window.scrollTo(0, 0);
  };
  const close = () => setOpenId(null);

  // 확인·서명 중에 점수를 고치면 작성 중으로 되돌리고, 받아둔 서명은 무효로 한다
  const edit = (fn: (s: Sheet) => Sheet) =>
    update(match!.id, (s) => {
      const next = fn(s);
      return s.status === 'reviewing' ? { ...next, status: 'draft', refSig: undefined, refSignedAt: undefined, teamSig: undefined } : next;
    });

  const finish = (patch: Partial<Sheet>) => {
    const signed: Sheet = { ...sheet!, ...patch, status: 'signed', signedAt: Date.now() };
    update(match!.id, () => signed);
    const c = calc(signed.values, match!.cat, ruleItems);
    submitScore(match!.id, match!.team, c.total, sheetPayload(match!, signed, ruleItems), c.penCnt);
    setMode('done');
    window.scrollTo(0, 0);
  };

  if (!match || !sheet) {
    return (
      <main className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-bold text-accent">테이블 {table}</p>
            <h1 className="mt-1 text-3xl font-extrabold">담당 경기</h1>
            <p className="mt-2 text-sm text-gray-500">채점을 시작할 경기를 선택하세요.</p>
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
                {tables.map((t) => <option key={t} value={t}>{t}번</option>)}
              </select>
            </label>
          )}
        </div>

        {([1, 2] as const).map((round) => (
          <Card key={round} title={`${round}차 조별 라운드`}>
            <div className="space-y-1 p-3">
              {matchesOfTable(matches, table)
                .filter((m) => m.round === round)
                .sort((a, b) => a.wave.localeCompare(b.wave) || (a.field === b.field ? 0 : a.field === '좌' ? -1 : 1))
                .map((m) => {
                  const t = teamOf(teams, m.team);
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
                        <small className="text-gray-500">{t ? `${t.id} ${t.name} · ${t.org}` : m.team}</small>
                      </span>
                      {s?.status === 'signed' && <b>{calc(s.values, m.cat, ruleItems).total}점</b>}
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
            {/* 서버 데이터를 복구한 뒤, 이 기기에 남은 기록을 모두 다시 보낸다 */}
            <button
              type="button"
              className="text-gray-600 underline"
              onClick={() => confirm('이 기기에 저장된 모든 점수를 서버로 다시 보냅니다. 서버 데이터를 복구한 뒤에 사용하세요.') && resendAll()}
            >
              저장된 점수 전체 재전송
            </button>
          </div>
        </Card>
      </main>
    );
  }

  const team = teamOf(teams, match.team);
  if (!team) {
    return (
      <main className="mx-auto max-w-4xl">
        <Card title={failed ? '대회 데이터를 불러오지 못했습니다' : '팀 정보를 불러오는 중'}>
          <p className="p-5 text-sm text-gray-500">
            {failed
              ? '서버에 연결할 수 없거나 로그인이 만료되었을 수 있습니다. 새로고침하거나 다시 로그인하세요.'
              : '대회 데이터를 서버에서 받아오는 중입니다. 잠시 후 다시 시도하세요.'}
          </p>
        </Card>
      </main>
    );
  }

  if (mode === 'review') {
    return <ReviewView match={match} team={team} sheet={sheet} ruleItems={ruleItems} onEdit={() => setMode('score')} onSign={() => { setStep(0); setMode('sign'); }} />;
  }

  if (mode === 'sign') {
    return (
      <SignView
        match={match}
        team={team}
        sheet={sheet}
        judgeName={judgeName}
        step={step}
        ruleItems={ruleItems}
        onRefSigned={(patch) => { update(match.id, (s) => ({ ...s, ...patch })); setStep(1); }}
        onFinish={finish}
        onBack={() => setMode('review')}
      />
    );
  }

  if (mode === 'done') {
    const sync = syncOf(match);
    const [syncText] = syncLabel(match);
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-line bg-white p-10 text-center">
        <div className="text-5xl text-accent">✓</div>
        <h1 className="mt-4 text-2xl font-extrabold">{sync === 'acked' ? '관리자에게 전달했어요' : sync === 'rejected' ? '서버가 거부했어요' : '이 기기에 저장했어요'}</h1>
        <p className="mt-2 text-sm text-gray-500">
          {team.id} {team.name} · {match.round}차 · 총점 <b>{calc(sheet.values, match.cat, ruleItems).total}점</b>
          {sheet.signException && ` · 서명 예외: ${sheet.signException}`}
        </p>
        <p className="mt-1 text-sm text-gray-500">
          {sync === 'acked' ? syncText : sync === 'rejected' ? '운영본부에 알려주세요' : '연결되면 자동으로 전송돼요 (전송 대기)'}
        </p>
        <div className="my-5 flex justify-center gap-6">
          {sheet.refSig && (
            <div>
              <p className="text-xs text-gray-500">심판</p>
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
        <p className="text-xs text-gray-500">서명 완료 후에는 심판이 수정할 수 없어요. 정정이 필요하면 운영본부에 요청하세요.</p>
        <button type="button" onClick={close} className={`${btnPrimary} mt-6`}>다음 경기로</button>
      </div>
    );
  }

  return (
    <ScoreView
      match={match}
      team={team}
      sheet={sheet}
      ruleItems={ruleItems}
      edit={edit}
      onBack={close}
      onReview={() => { update(match.id, (s) => ({ ...s, status: 'reviewing' })); setMode('review'); window.scrollTo(0, 0); }}
    />
  );
}
