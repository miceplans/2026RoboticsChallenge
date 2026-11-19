'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import ReviewView from '@/components/judge/ReviewView';
import ScoreView from '@/components/judge/ScoreView';
import SignView from '@/components/judge/SignView';
import { useToast } from '@/components/Toast';
import { btnGhost, btnPrimary, Card, Chip, type Tone } from '@/components/judge/ui';
import { StatusBadge } from '@/components/LiveLeaderboard';
import { gameNoOf, teamOf, useContest, type Match, type TournamentGame, type TournamentRound } from '@/lib/contest';
import { calc, CATEGORY_NAMES, ITEMS, parseTemplate, type Item } from '@/lib/judge/rules';
import { newSheet, sheetPayload, useSheets, type Sheet } from '@/lib/judge/sheets';
import { scoreKey } from '@/lib/realtime/outbox';
import { useRealtime } from '@/lib/realtime/useRealtime';
import { useTeamScores } from '@/lib/scores';
import Score from '@/components/team/Score';
import HomologationBadge from '@/components/team/HomologationBadge';
import { downloadScoreSheetPdf, ScoreSheetPdf } from '@/components/judge/ScoreSheetPdf';

type Mode = 'score' | 'review' | 'sign' | 'done';

const T_LABEL: Record<TournamentRound, string> = { QF: '8강', SF: '준결승', F: '결승', '3P': '3·4위전' };
const T_ORDER: TournamentRound[] = ['QF', 'SF', 'F', '3P'];
const serverUrl = () => process.env.NEXT_PUBLIC_REALTIME_URL ?? `${location.protocol}//${location.hostname}:4000`;
const isT = (m: Match) => m.id.startsWith('T:');
const parseT = (id: string) => { const [, cat, round, no, side] = id.split(':'); return { cat, round: round as TournamentRound, gameNo: Number(no), side: side as 'A' | 'B' }; };

export default function JudgeConsole({ judgeId, judgeName }: { judgeId: string; judgeName: string }) {
  const { status, history, pending, rejected, submitScore, resendAll } = useRealtime();
  const { scoreOf } = useTeamScores();
  const { config, failed } = useContest();
  const matches = config?.matches ?? [];
  const teams = config?.teams ?? [];
  const approvedRobotsOf = (teamId: string) => config?.homologationRobots?.[teamId] ?? [];
  // 관리자가 저장한 채점표 템플릿이 있으면 그것을 쓰고, 없거나 형식이 이상하면 기본 규칙 항목표를 쓴다
  const ruleItems = useMemo<Item[]>(() => parseTemplate(config?.template) ?? ITEMS, [config?.template]);
  const { sheets, update } = useSheets(judgeId);
  const toast = useToast();

  // 서버가 점수를 거부한 사유는 화면에 적지 않고 토스트로 알린다
  useEffect(() => {
    if (rejected) toast(rejected);
  }, [rejected, toast]);

  const [openId, setOpenId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('score');
  const [step, setStep] = useState<0 | 1>(0);
  const pdfRef = useRef<HTMLDivElement>(null);
  const [pdfSheet, setPdfSheet] = useState<Sheet | null>(null);

  // 심판에게 조 배정은 없다: 모든 심판이 전체 경기를 보고 어느 경기든 채점한다.
  // 부문별 진행 단계 (1차 → 2차 → 토너먼트). 서버가 잠그고 화면은 그대로 보여준다.
  const tableCats = (['J', 'S'] as const).filter((c) => matches.some((m) => m.cat === c));
  const progress = config?.progress;
  const r2Open = (c: 'J' | 'S') => !progress || progress[c].round2Open;
  // 토너먼트 경기: 두 팀을 각각 1·2차와 같은 채점표로 채점한다. 팀마다 가상 경기(T:부문:라운드:경기번호:A|B)로 만들어 같은 화면·서명 흐름을 쓴다.
  const tCats = tableCats.filter((c) => progress?.[c].tournamentOpen);
  const tGames: TournamentGame[] = (config?.tournament.games ?? [])
    .filter((g) => tCats.includes(g.cat) && g.teamA && g.teamB && g.status !== 'done')
    .sort((a, b) => a.cat.localeCompare(b.cat) || T_ORDER.indexOf(a.round) - T_ORDER.indexOf(b.round) || a.gameNo - b.gameNo);
  const tMatch = (g: TournamentGame, side: 'A' | 'B'): Match => ({ id: `T:${g.cat}:${g.round}:${g.gameNo}:${side}`, round: 2, cat: g.cat, wave: 'A', table: 0, field: side === 'A' ? '좌' : '우', team: (side === 'A' ? g.teamA : g.teamB)!, label: `${T_LABEL[g.round]} ${g.gameNo}경기` });
  const match = [...matches, ...tGames.flatMap((g) => [tMatch(g, 'A'), tMatch(g, 'B')])].find((m) => m.id === openId) ?? null;
  const tSubs = config?.tournament.submissions ?? [];
  const tSubOf = (g: TournamentGame) => tSubs.find((x) => x.cat === g.cat && x.round === g.round && x.gameNo === g.gameNo);
  const totalOf = (m: Match, s: Sheet) => calc(s.values, m.cat, ruleItems).total;
  // 두 팀 채점이 모두 서명되면 점수를 서버에 낸다 (운영본부가 확정). 서명된 시트는 로컬에 남아 있다.
  const postGame = async (g: TournamentGame, overrides?: Record<string, Sheet>) => {
    const a = tMatch(g, 'A');
    const b = tMatch(g, 'B');
    const sa = overrides?.[a.id] ?? sheets[a.id];
    const sb = overrides?.[b.id] ?? sheets[b.id];
    if (sa?.status !== 'signed' || sb?.status !== 'signed') return;
    try {
      const res = await fetch(`${serverUrl()}/judge/tournament/score`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cat: g.cat, round: g.round, gameNo: g.gameNo, scoreA: totalOf(a, sa), scoreB: totalOf(b, sb) }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      toast(res.ok && data?.ok ? `${T_LABEL[g.round]} ${g.gameNo}경기 점수를 제출했습니다. 운영본부가 확정합니다.` : (data?.error ?? `제출 실패 (${res.status})`));
    } catch {
      toast('서버에 연결할 수 없습니다. 아래 \'다시 제출\'로 보내세요.');
    }
  };
  const sheet = match ? (sheets[match.id] ?? newSheet()) : null;

  // 서버 제출 상태: 전송 대기 / 서버 저장됨 / 거부됨
  const syncOf = (m: Match) => history.find((h) => scoreKey(h) === scoreKey({ matchId: m.id, teamId: m.team }))?.status;
  const syncLabel = (m: Match): [string, Tone] => {
    const s = syncOf(m);
    return s === 'acked' ? ['서버 저장됨', 'info'] : s === 'rejected' ? ['거부됨', 'bad'] : ['전송 대기', 'warn'];
  };

  const open = (m: Match) => {
    if (m.round === 2 && progress && !progress[m.cat].round2Open) return; // 서버도 막지만 화면에서도 열지 않는다
    const s = sheets[m.id];
    setOpenId(m.id);
    setPdfSheet(null);
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

  const finish = async (patch: Partial<Sheet>) => {
    const signed: Sheet = { ...sheet!, ...patch, status: 'signed', signedAt: Date.now() };
    // 서명 화면을 유지한 채 PDF 전용 영역만 최종 서명 데이터로 다시 그린다.
    flushSync(() => setPdfSheet(signed));
    if (pdfRef.current) {
      try {
        await downloadScoreSheetPdf(pdfRef.current, match!, teamOf(teams, match!.team)!);
      } catch (error) {
        toast(`PDF 저장 실패: ${(error as Error).message}`);
      }
    }
    update(match!.id, () => signed);
    if (isT(match!)) {
      // 토너먼트: 조별 점수 전송 대신, 두 팀이 모두 서명되면 경기 점수로 낸다
      const p = parseT(match!.id);
      const g = tGames.find((x) => x.cat === p.cat && x.round === p.round && x.gameNo === p.gameNo);
      if (g) void postGame(g, { [match!.id]: signed });
      setMode('done');
      window.scrollTo(0, 0);
      return;
    }
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
            <h1 className="text-3xl font-extrabold">경기 목록</h1>
            <p className="mt-2 text-sm text-gray-500">채점을 시작할 경기를 선택하세요.</p>
          </div>
        </div>

        {progress && tableCats.map((c) => { const catProgress = progress[c]; return (
          <Card key={c} title={`${CATEGORY_NAMES[c]} 진행 단계`}>
            <ol className="flex flex-wrap gap-2 p-4 text-sm">
              {[
                { label: '1차', state: catProgress.round2Open ? 'done' : 'now', note: `${catProgress.r1.submitted}/${catProgress.r1.total}경기 제출` },
                { label: '2차', state: !catProgress.round2Open ? 'wait' : catProgress.tournamentOpen ? 'done' : 'now', note: catProgress.round2Open ? `${catProgress.r2.confirmed}/${catProgress.r2.total}경기 확정` : '1차 종료 후 시작' },
                { label: '8강~결승', state: catProgress.tournamentOpen ? 'now' : 'wait', note: catProgress.tournamentOpen ? '배정 가능' : '2차 확정 후 시작' },
              ].map((st) => (
                <li key={st.label} className={`flex-1 rounded-xl border px-3 py-2 ${st.state === 'now' ? 'border-accent bg-[#eaf5ff]' : st.state === 'done' ? 'border-line bg-surface' : 'border-line opacity-50'}`}>
                  <b className="block">{st.label}{st.state === 'done' ? ' ✓' : st.state === 'now' ? ' · 진행 중' : ''}</b>
                  <small className="text-gray-500">{st.note}</small>
                </li>
              ))}
            </ol>
          </Card>
        ); })}

        {([1, 2] as const).map((round) => (
          <Card key={round} title={`${round}차 조별 라운드`}>
            <div className="space-y-1 p-3">
              {round === 2 && progress && tableCats.filter((c) => !r2Open(c)).map((c) => (
                <p key={c} className="px-3 py-2 text-sm text-gray-500">
                  🔒 {CATEGORY_NAMES[c]} 2차는 1차가 모두 끝나면 열립니다. (1차 {progress[c].r1.submitted}/{progress[c].r1.total}경기 제출)
                </p>
              ))}
              {matches
                .filter((m) => m.round === round && (round === 1 || r2Open(m.cat)))
                .sort((a, b) => gameNoOf(a) - gameNoOf(b) || a.wave.localeCompare(b.wave))
                .map((m) => {
                  const t = teamOf(teams, m.team);
                  const s = sheets[m.id];
                  // 이 기기에 기록이 없어도 서버에 확정된 점수가 있으면 그것을 보여준다 (순위·관리자 화면과 같은 출처)
                  const serverPts = scoreOf(m.team)?.[m.round === 1 ? 'r1' : 'r2'];
                  const [text, tone]: [string, Tone] =
                    !s ? (serverPts != null ? ['서버 확정', 'info'] : ['미입력', 'neutral'])
                    : s.status === 'draft' ? ['작성 중', 'warn']
                    : s.status === 'reviewing' ? ['확인·서명 중', 'warn']
                    : syncLabel(m);
                  return (
                    <button key={m.id} type="button" onClick={() => open(m)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left transition-colors hover:bg-surface">
                      <Chip tone={m.cat === 'S' ? 'info' : 'neutral'}>{CATEGORY_NAMES[m.cat]}</Chip>
                      <span className="flex-1">
                        <b className="block">{gameNoOf(m)}번째 경기 · {m.table}조 · {m.wave} 테이블</b>
                        <small className="text-gray-500">{t ? <>{t.id} {t.name}<HomologationBadge teamId={t.id} /> · {t.org}{config?.homologation?.[t.id] && ` · 승인 ${approvedRobotsOf(t.id).join(', ') || '없음'}`}</> : m.team}</small>
                      </span>
                      {s?.status === 'signed' ? <b><Score value={calc(s.values, m.cat, ruleItems).total} /></b> : !s && serverPts != null ? <b><Score value={serverPts} /></b> : null}
                      <Chip tone={tone}>{text}</Chip>
                      <span>›</span>
                    </button>
                  );
                })}
            </div>
          </Card>
        ))}

        {tCats.length > 0 && (
          <Card title={`${tCats.map((c) => CATEGORY_NAMES[c]).join('·')} 토너먼트`}>
            {tGames.length === 0 ? (
              <p className="p-6 text-center text-sm text-gray-500">채점할 경기가 없습니다. 8강 팀 배정과 이전 라운드 확정 뒤에 열립니다.</p>
            ) : (
              <div className="divide-y divide-line">
                {tGames.map((g) => {
                  const sub = tSubOf(g);
                  const ms = [tMatch(g, 'A'), tMatch(g, 'B')];
                  const bothSigned = ms.every((m) => sheets[m.id]?.status === 'signed');
                  return (
                    <div key={`${g.cat}-${g.round}-${g.gameNo}`} className="space-y-1 p-3">
                      <div className="flex items-center gap-2 px-3 pt-1">
                        <b>{tCats.length > 1 ? `${CATEGORY_NAMES[g.cat]} ` : ''}{T_LABEL[g.round]} {g.gameNo}경기</b>
                        {sub && <Chip tone="info">제출됨 · 확정 대기</Chip>}
                      </div>
                      {ms.map((m) => {
                        const t = teamOf(teams, m.team);
                        const s = sheets[m.id];
                        const [text, tone]: [string, Tone] = !s ? ['미입력', 'neutral'] : s.status === 'draft' ? ['작성 중', 'warn'] : s.status === 'reviewing' ? ['확인·서명 중', 'warn'] : ['서명 완료', 'info'];
                        return (
                          <button key={m.id} type="button" onClick={() => open(m)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-surface">
                            <span className="flex-1">
                              <b className="block">{t ? <>{t.id} {t.name}<HomologationBadge teamId={t.id} /></> : m.team}</b>
                              <small className="text-gray-500">{t?.org}{t && config?.homologation?.[t.id] && ` · 승인 ${approvedRobotsOf(t.id).join(', ') || '없음'}`}</small>
                            </span>
                            {s?.status === 'signed' && <b><Score value={totalOf(m, s)} /></b>}
                            <Chip tone={tone}>{text}</Chip>
                            <span>›</span>
                          </button>
                        );
                      })}
                      {bothSigned && !sub && (
                        <div className="flex gap-2 px-3 pb-1 pt-1">
                          <button type="button" className={`${btnPrimary} !px-4 !py-2`} onClick={() => void postGame(g)}>다시 제출</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}

        <Card title="서버 동기화">
          <div className="space-y-2 px-5 py-4 text-sm">
            <StatusBadge status={status} />
            <p className="text-gray-600">
              {pending > 0 ? `전송 대기 ${pending}건 · 연결되면 자동 전송됩니다` : '서명을 마친 점수는 모두 서버에 저장되었습니다'}
            </p>
            {/* 서버 데이터를 복구한 뒤, 이 기기에 남은 기록을 모두 다시 보낸다 */}
            <button
              type="button"
              className={btnGhost}
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
      <>
        <ScoreSheetPdf ref={pdfRef} judgeId={judgeId} judgeName={judgeName} match={match} team={team} sheet={pdfSheet ?? sheet} ruleItems={ruleItems} />
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
      </>
    );
  }

  if (mode === 'done' && isT(match)) {
    const p = parseT(match.id);
    const g = tGames.find((x) => x.cat === p.cat && x.round === p.round && x.gameNo === p.gameNo);
    const other = g ? tMatch(g, p.side === 'A' ? 'B' : 'A') : null;
    const otherDone = other ? sheets[other.id]?.status === 'signed' : false;
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-line bg-white p-10 text-center">
        <div className="text-5xl text-accent">✓</div>
        <h1 className="mt-4 text-2xl font-extrabold">{otherDone ? '경기 점수를 운영본부에 냈어요' : '채점을 저장했어요'}</h1>
        <p className="mt-2 text-sm text-gray-500">{team.id} {team.name} · {match.label} · 총점 <b>{calc(sheet.values, match.cat, ruleItems).total}점</b></p>
        <p className="mt-1 text-sm text-gray-500">{otherDone ? '두 팀 채점이 끝났어요. 운영본부가 승자를 확정합니다.' : '상대 팀도 채점하고 서명하면 경기 점수가 함께 제출돼요.'}</p>
        <button type="button" onClick={close} className={`${btnPrimary} mt-6`}>경기 목록으로</button>
      </div>
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
    <>
      <ScoreSheetPdf ref={pdfRef} judgeId={judgeId} judgeName={judgeName} match={match} team={team} sheet={sheet} ruleItems={ruleItems} />
      <ScoreView
        match={match}
        team={team}
        sheet={sheet}
        ruleItems={ruleItems}
        judgeName={judgeName}
        edit={edit}
        onBack={close}
        onReview={() => {
          update(match.id, (s) => ({ ...s, status: 'reviewing' }));
          setMode('review');
          window.scrollTo(0, 0);
        }}
      />
    </>
  );
}
