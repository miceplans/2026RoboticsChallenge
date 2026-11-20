'use client';

import ScoreValue from '@/components/team/Score';
import HomologationBadge from '@/components/team/HomologationBadge';
import { useEffect, useRef, useState } from 'react';
import { downloadScoreSheetsPdf, scoreSheetGameLabel } from '@/components/judge/ScoreSheetPdf';
import { OfficialScoreSheet, type SheetRow } from '@/components/judge/OfficialScoreSheet';
import { ITEMS, parseTemplate } from '@/lib/judge/rules';
import MatchOrder from './MatchOrder';
import NoticeBanner from './NoticeBanner';
import { computeSchedule, slotLabel, useContest, withRanks, type Match, type Team } from '@/lib/contest';
import { useRealtime, useTeamScores } from '@/lib/realtime/useRealtime';

// 관리자 화면과 같은 규칙(주니어 1조 → … 주니어 8조 → 시니어 1조 → … 시니어 8조)으로 이 팀의 1R·2R 경기를 구한다
function useMySchedule(team?: Team) {
  const { config } = useContest();
  if (!team || !config) return [];
  return computeSchedule(config.matches).filter((m) => m.team === team.id);
}

// 로그인한 팀에게 1R·2R 에서 몇 조 어느 테이블(A/B)로 몇 번째 경기인지 항상 보여준다
function MyMatchBanner({ team }: { team?: Team }) {
  const mine = useMySchedule(team);
  if (!team || !mine.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {mine.map((m) => (
        <div key={m.id} className="flex items-center gap-4 rounded-2xl border border-accent bg-white px-5 py-4">
          <b className="text-2xl font-extrabold text-accent">{m.round}R</b>
          <div className="min-w-0 flex-1">
            <b className="block text-lg">{m.table}조 · {m.wave} 테이블</b>
            <span className="text-sm text-gray-500">{m.cat === 'S' ? '시니어' : '주니어'} 부문</span>
          </div>
          <span className="shrink-0 rounded-full bg-accent px-3 py-1 text-sm font-bold text-white">{m.game}번째 경기</span>
        </div>
      ))}
    </div>
  );
}

export default function ParticipantPortal({ name, teamId }: { name: string; teamId?: string }) {
  // 회원가입 시 본선 명단과 일치한 팀으로 연결된다. 팀이 없으면(심판/관리자) undefined
  const { config } = useContest();
  const team = teamId ? config?.teams.find((t) => t.id === teamId) : undefined;
  const [t, setT] = useState('팀 정보');
  const tabs = ['팀 정보', '내 점수표', '내 일정', '경기 순서'];
  return (
    <main className="mt-[73px] min-h-[calc(100vh-73px)] bg-[#f7f9fc]">
      <div className="mx-auto max-w-6xl px-5 py-7">
        <div className="mt-6 space-y-3">
          <NoticeBanner />
          <MyMatchBanner team={team} />
        </div>
        <nav className="mt-6 flex flex-wrap gap-2 border-b border-line">
          {tabs.map((x) => (
            <button key={x} onClick={() => setT(x)} className={`whitespace-nowrap px-4 py-3 text-sm font-bold ${t === x ? 'border-b-2 border-accent text-accent' : 'text-gray-500'}`}>
              {x}
            </button>
          ))}
        </nav>
        {t === '팀 정보' && <TeamInfo team={team} me={name} />}
        {t === '내 점수표' && <Score team={team} />}
        {t === '내 일정' && <Schedule team={team} />}
        {t === '경기 순서' && <MatchOrder myTeam={team?.id} />}
      </div>
    </main>
  );
}

// 팀에 연결되지 않은 계정(데모 계정, 심판/관리자)이 참가자 전용 탭을 볼 때
function TeamNotice() {
  return (
    <p className="mt-6 rounded-2xl border border-line bg-white p-6 text-sm text-gray-500">
      참가 팀 명단에 연결된 계정이 아닙니다. 팀에 연결된 참가자 계정으로 로그인하면 우리 팀 채점 표와 팀 정보를 확인할 수 있습니다.
    </p>
  );
}

function TeamInfo({ team, me }: { team?: Team; me: string }) {
  const { config } = useContest();
  if (!team) return <TeamNotice />;
  const status = config?.homologation?.[team.id];
  const approvedRobots = config?.homologationRobots?.[team.id] ?? [];
  const rows: [string, string][] = [
    ['팀명', team.name],
    ['팀번호', team.id],
    ['참가 코드', team.code],
    ['부문', team.cat === 'J' ? '주니어' : '시니어'],
    ['지역', team.region],
    ['소속', team.org],
    ['지도자', team.coach],
  ];
  return (
    <section className="mt-7">
      <p className="font-bold text-accent">{team.id} · {team.cat === 'J' ? '주니어' : '시니어'} 부문</p>
      <h1 className="mt-1 text-3xl font-extrabold">팀 정보</h1>
      <article className={`mt-6 rounded-2xl border p-5 ${status === 'pass' ? 'border-accent bg-accent-tint' : 'border-line bg-white'}`}>
        <div className="flex items-start gap-3">
          <HomologationBadge teamId={team.id} />
          <div>
            <h2 className="font-extrabold">로봇 승인 결과</h2>
            <p className="mt-1 text-sm text-gray-600">
              {!status
                ? '아직 승인 결과가 등록되지 않았습니다.'
                : approvedRobots.length
                  ? `출전 승인 로봇: ${approvedRobots.join(', ')}`
                  : '출전 승인된 로봇이 없습니다.'}
            </p>
          </div>
        </div>
      </article>
      <article className="mt-4 rounded-2xl border border-line bg-white p-6">
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 border-b border-line pb-3 text-sm sm:block sm:border-b-0 sm:pb-0">
              <dt className="shrink-0 text-gray-500">{label}</dt>
              <dd className="font-semibold sm:mt-1">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6 border-t border-line pt-5">
          <p className="text-sm text-gray-500">팀원 {team.members.length}명</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {team.members.map((m) => (
              <span key={m} className={`rounded-full px-3 py-1 text-sm font-semibold ${m === me ? 'bg-accent text-white' : 'bg-surface-secondary text-gray-700'}`}>
                {m}{m === me ? ' (나)' : ''}
              </span>
            ))}
          </div>
        </div>
      </article>
    </section>
  );
}

function Score({ team }: { team?: Team }) {
  const { standings, standingsAt } = useRealtime();
  const { config } = useContest();
  const matches = (config?.matches ?? []).filter((m) => m.team === team?.id);
  const { scores, loaded } = useTeamScores(team?.id);
  const [sheetMatch, setSheetMatch] = useState<Match | null>(null);
  if (!team) return <TeamNotice />;

  const mine = withRanks(standings, team.cat).find((s) => s.teamId === team.id);
  const best = scores.length ? Math.max(...scores.map((s) => s.points)) : undefined;

  // 심판별 제출 점수를 경기별로 묶는다. (경기, 팀, 심판)당 1건이므로 한 경기에 점수가 여러 개일 수 있다.
  const byMatch = new Map<string, number[]>();
  for (const s of scores) {
    const arr = byMatch.get(s.matchId) ?? [];
    arr.push(s.points);
    byMatch.set(s.matchId, arr);
  }

  return (
    <section className="mt-7">
      <p className="font-bold text-accent">{team.id} {team.name}<HomologationBadge teamId={team.id} /> · {team.cat === 'J' ? '주니어' : '시니어'}</p>
      <h1 className="mt-1 text-3xl font-extrabold">내 점수표</h1>
      {mine && (
        <article className="mt-6 rounded-2xl border border-line bg-white p-6">
          <div className="flex justify-between">
            <div>
              <b>현재 {mine.rank}위{mine.tied ? ' (동점)' : ''}</b>
              <p className="mt-1 text-sm text-gray-500">실시간 순위표 기준 (1·2차 최고점)</p>
              {(mine.r1 !== null || mine.r2 !== null) && (
                <p className="mt-1 text-sm text-gray-500">1차 <ScoreValue value={mine.r1} /> · 2차 <ScoreValue value={mine.r2} /></p>
              )}
            </div>
            <strong className="text-3xl text-accent"><ScoreValue value={mine.total} /></strong>
          </div>
          {standingsAt && <p className="mt-4 border-t border-line pt-3 text-xs text-gray-400">마지막 수신 {new Date(standingsAt).toLocaleTimeString('ko-KR')}</p>}
        </article>
      )}
      <h2 className="mt-8 text-xl font-extrabold">채점 표</h2>
      {!loaded ? (
        <p className="mt-4 rounded-2xl border border-line bg-white p-6 text-sm text-gray-500">채점 데이터를 불러오는 중입니다…</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-accent text-white">
              <tr>
                <th className="px-4 py-3 font-semibold">라운드</th>
                <th className="px-4 py-3 font-semibold">배정</th>
                <th className="px-4 py-3 font-semibold">심판별 점수</th>
                <th className="px-4 py-3 text-right font-semibold">최고점</th>
                <th className="px-4 py-3 text-right font-semibold">심사표</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {matches.map((m) => {
                const pts = (byMatch.get(m.id) ?? []).sort((a, b) => b - a);
                return (
                  <tr key={m.id}>
                    <td className="px-4 py-3 font-semibold">{m.round}차</td>
                    <td className="px-4 py-3">{slotLabel(m, false)}</td>
                    <td className="px-4 py-3 tabular-nums">{pts.length ? pts.join(' · ') : '미제출'}</td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums">{pts[0] ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {pts.length ? (
                        <button onClick={() => setSheetMatch(m)} className="rounded-full border border-accent px-3 py-1 text-xs font-bold text-accent hover:bg-accent-tint">
                          보기
                        </button>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="border-t border-line px-4 py-3 text-xs text-gray-400">
            {best !== undefined ? `팀 최고점 ${best}점 (1·2차 중 최댓값이 순위에 반영됩니다)` : '아직 제출된 채점이 없습니다.'}
          </p>
        </div>
      )}
      {sheetMatch && <MySheetModal team={team} match={sheetMatch} onClose={() => setSheetMatch(null)} />}
    </section>
  );
}

const serverUrl = () => process.env.NEXT_PUBLIC_REALTIME_URL ?? `${location.protocol}//${location.hostname}:4000`;

// 심판이 서명한 우리 팀 채점지(공식 점수표 양식)를 그대로 보여주고 PDF로 내려받는다. 한 경기에 심판이 여럿이면 모두 보여준다.
function MySheetModal({ team, match, onClose }: { team: Team; match: Match; onClose: () => void }) {
  const { config } = useContest();
  const items = parseTemplate(config?.template) ?? ITEMS;
  const [rows, setRows] = useState<SheetRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const nodes = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    let alive = true;
    const q = new URLSearchParams({ teamId: team.id, matchId: match.id });
    fetch(`${serverUrl()}/team-sheets?${q.toString()}`, { credentials: 'include' })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as { ok: true; sheets: SheetRow[] } | { ok: false; error: string } | null;
        if (!alive) return;
        if (res.ok && data?.ok) setRows(data.sheets);
        else {
          setError(res.status === 403 ? '지금은 심사표를 볼 수 없습니다.' : '심사표를 불러오지 못했습니다.');
          setRows([]);
        }
      })
      .catch(() => {
        if (!alive) return;
        setError('서버에 연결할 수 없습니다.');
        setRows([]);
      });
    return () => {
      alive = false;
    };
  }, [team.id, match.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const download = async () => {
    const targets = (rows ?? []).map((r) => nodes.current.get(r.judgeId)).filter((n): n is HTMLDivElement => !!n);
    if (!targets.length) return;
    setBusy(true);
    try {
      await downloadScoreSheetsPdf(targets, `${team.name}-${scoreSheetGameLabel(match)}`);
    } catch (e) {
      setError(`PDF 생성 실패: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="심사표"
        className="flex max-h-[90vh] w-full max-w-[860px] flex-col rounded-2xl bg-white p-4 sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-extrabold">
            심사표 <span className="ml-1 text-sm font-normal text-gray-400">{scoreSheetGameLabel(match)} · {slotLabel(match, false)}</span>
          </h2>
          <button onClick={onClose} aria-label="닫기" className="rounded-full px-2 py-1 text-xl leading-none text-gray-500 hover:bg-gray-100">×</button>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-auto rounded-xl border border-line bg-gray-50 p-3">
          {rows === null && <p className="py-10 text-center text-gray-400">불러오는 중…</p>}
          {rows && rows.length === 0 && !error && <p className="py-10 text-center text-gray-400">아직 서명된 심사표가 없습니다.</p>}
          {rows?.map((row) => (
            <div key={row.judgeId} className="space-y-2">
              {rows.length > 1 && (
                <p className="text-sm text-gray-600">
                  심판 {row.judgeName ?? row.judgeId} · <b className="tabular-nums">{row.points}점</b>
                </p>
              )}
              <div className="mx-auto w-[794px] bg-white">
                <OfficialScoreSheet
                  row={row}
                  items={items}
                  sheetRef={(node) => {
                    if (node) nodes.current.set(row.judgeId, node);
                    else nodes.current.delete(row.judgeId);
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-gray-600">닫기</button>
          <button
            onClick={download}
            disabled={!rows?.length || busy}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? '만드는 중…' : 'PDF 다운로드'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Schedule({ team }: { team?: Team }) {
  const mine = useMySchedule(team);
  if (!team) return <TeamNotice />;
  return (
    <section className="mt-7">
      <h1 className="text-3xl font-extrabold">내 일정</h1>
      {mine.map((m) => (
        <article key={m.id} className="mt-4 flex items-center gap-5 rounded-2xl border border-line bg-white p-5">
          <b className="w-12 shrink-0 text-accent">{m.round}R</b>
          <div>
            <b>{m.table}조 · {m.wave} 테이블</b>
            <p className="mt-1 text-sm text-gray-500">{m.cat === 'S' ? '시니어' : '주니어'} 부문</p>
          </div>
          <span className="ml-auto shrink-0 rounded-full bg-accent-tint px-3 py-1 text-sm font-bold text-accent">{m.game}번째 경기</span>
        </article>
      ))}
    </section>
  );
}
