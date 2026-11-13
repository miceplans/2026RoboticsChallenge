'use client';

import { useState } from 'react';
import RankingBoard from './RankingBoard';
import { useContest, type Team } from '@/lib/contest';
import { useRealtime, useTeamScores } from '@/lib/realtime/useRealtime';

export default function ParticipantPortal({ name, teamId }: { name: string; teamId?: string }) {
  // 회원가입 시 본선 명단과 일치한 팀으로 연결된다. 팀이 없으면(심판/관리자) undefined
  const { config } = useContest();
  const team = teamId ? config?.teams.find((t) => t.id === teamId) : undefined;
  const [t, setT] = useState('팀 정보');
  const tabs = ['팀 정보', '내 점수표', '내 일정', '랭킹', '경기 중계'];
  return (
    <main className="min-h-screen bg-[#f7f9fc]">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-[73px] max-w-6xl items-center justify-between px-5">
          <div>
            <b>2026 로보틱스 챌린지</b>
            <p className="text-xs text-gray-500">문제해결 트랙 본선</p>
          </div>
          <span className="rounded-full bg-accent-tint px-3 py-1 text-sm font-bold text-accent">
            {name}{team ? ` · ${team.id} ${team.name}` : ''}
          </span>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-5 py-7">
        {config?.settings.notice.message && (
          <div className="mt-6 rounded-2xl bg-accent-tint px-5 py-4 text-sm text-accent">📢 {config.settings.notice.message}</div>
        )}
        <nav className="mt-6 flex gap-2 overflow-x-auto border-b border-line">
          {tabs.map((x) => (
            <button key={x} onClick={() => setT(x)} className={`whitespace-nowrap px-4 py-3 text-sm font-bold ${t === x ? 'border-b-2 border-accent text-accent' : 'text-gray-500'}`}>
              {x}
            </button>
          ))}
        </nav>
        {t === '팀 정보' && <TeamInfo team={team} me={name} />}
        {t === '내 점수표' && <Score team={team} />}
        {t === '내 일정' && <Schedule team={team} />}
        {t === '랭킹' && <RankingBoard />}
        {t === '경기 중계' && <Live />}
      </div>
    </main>
  );
}

// 팀에 연결되지 않은 계정(데모 계정, 심판/관리자)이 참가자 전용 탭을 볼 때
function TeamNotice() {
  return (
    <p className="mt-6 rounded-2xl border border-line bg-white p-6 text-sm text-gray-500">
      참가 팀 명단에 연결된 계정이 아닙니다. 참가자는 회원가입 시 본선 명단의 팀 이름과 본인 이름을 입력하면 우리 팀 채점 표와 팀 정보를 확인할 수 있습니다.
    </p>
  );
}

function TeamInfo({ team, me }: { team?: Team; me: string }) {
  if (!team) return <TeamNotice />;
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
      <article className="mt-6 rounded-2xl border border-line bg-white p-6">
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
  if (!team) return <TeamNotice />;

  const rank = standings.findIndex((s) => s.teamId === team.id) + 1;
  const mine = rank > 0 ? standings[rank - 1] : undefined;
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
      <p className="font-bold text-accent">{team.id} {team.name} · {team.cat === 'J' ? '주니어' : '시니어'}</p>
      <h1 className="mt-1 text-3xl font-extrabold">내 점수표</h1>
      {mine && (
        <article className="mt-6 rounded-2xl border border-line bg-white p-6">
          <div className="flex justify-between">
            <div>
              <b>현재 순위 {rank}위</b>
              <p className="mt-1 text-sm text-gray-500">실시간 순위표 기준 (1·2차 최고점)</p>
            </div>
            <strong className="text-3xl text-accent">{mine.total}점</strong>
          </div>
          {standingsAt && <p className="mt-4 border-t border-line pt-3 text-xs text-gray-400">마지막 수신 {new Date(standingsAt).toLocaleTimeString('ko-KR')}</p>}
        </article>
      )}
      <h2 className="mt-8 text-xl font-extrabold">채점 표</h2>
      {!loaded ? (
        <p className="mt-4 rounded-2xl border border-line bg-white p-6 text-sm text-gray-500">채점 데이터를 불러오는 중입니다…</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-accent text-white">
              <tr>
                <th className="px-4 py-3 font-semibold">라운드</th>
                <th className="px-4 py-3 font-semibold">배정</th>
                <th className="px-4 py-3 font-semibold">심판별 점수</th>
                <th className="px-4 py-3 text-right font-semibold">최고점</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {matches.map((m) => {
                const pts = (byMatch.get(m.id) ?? []).sort((a, b) => b - a);
                return (
                  <tr key={m.id}>
                    <td className="px-4 py-3 font-semibold">{m.round}차</td>
                    <td className="px-4 py-3">{m.wave}조 · 테이블 {m.table} {m.field}</td>
                    <td className="px-4 py-3 tabular-nums">{pts.length ? pts.join(' · ') : '미제출'}</td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums">{pts[0] ?? '—'}</td>
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
    </section>
  );
}

function Schedule({ team }: { team?: Team }) {
  const { config } = useContest();
  if (!team) return <TeamNotice />;
  const mine = (config?.matches ?? []).filter((m) => m.team === team.id);
  return (
    <section className="mt-7">
      <h1 className="text-3xl font-extrabold">내 일정</h1>
      {mine.map((m) => (
        <article key={m.id} className="mt-4 flex items-center gap-5 rounded-2xl border border-line bg-white p-5">
          <b className="w-12 shrink-0 text-accent">{m.round}차</b>
          <div>
            <b>{m.wave}조 · 테이블 {m.table} {m.field}</b>
            <p className="mt-1 text-sm text-gray-500">{m.cat === 'S' ? '시니어' : '주니어'} 부문</p>
          </div>
        </article>
      ))}
    </section>
  );
}

function Live() {
  const url = process.env.NEXT_PUBLIC_BROADCAST_URL;
  return (
    <section className="mt-7 rounded-2xl border border-line bg-white p-6">
      <h1 className="text-2xl font-extrabold">경기 중계</h1>
      {url ? (
        <div className="mt-5 aspect-video overflow-hidden rounded-2xl bg-gray-900">
          <iframe src={url} title="본선 경기 라이브" className="h-full w-full" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
        </div>
      ) : (
        <div className="mt-5 flex aspect-video items-center justify-center rounded-2xl bg-gray-900 text-center text-white">
          <div>
            <b className="text-4xl">▶</b>
            <p className="mt-3">본선 경기 라이브</p>
            <small className="text-gray-400">중계 URL이 등록되면 재생됩니다.</small>
          </div>
        </div>
      )}
    </section>
  );
}
