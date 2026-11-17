'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/components/Toast';
import Score from '@/components/team/Score';
import TeamName from '@/components/team/TeamName';
import { useContest } from '@/lib/contest';
import { useTeamScores } from '@/lib/scores';
import { adminFetch, btn, card, timeAgo } from './shared';
import { resetPasswordOne, type AccountRow } from './Teams';

const ACCOUNT_ROLES = [
  { id: '', label: '전체' },
  { id: 'user', label: '팀' },
  { id: 'judge', label: '심판' },
  { id: 'admin', label: '관리자' },
] as const;
const ROLE_LABEL = { user: '팀', judge: '심판', admin: '관리자' } as const;
const T_ROUNDS = [
  { id: 'QF', label: '8강' },
  { id: 'SF', label: '준결승' },
  { id: 'F', label: '결승' },
  { id: '3P', label: '3·4위전' },
] as const;

export default function Accounts() {
  const toast = useToast();
  const { config } = useContest();
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const { scoreOf } = useTeamScores(); // 순위표·대진표와 같은 심판 확정 점수 (팀별 라운드 최고점)
  const [role, setRole] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    adminFetch<{ users: AccountRow[] }>('/admin/users').then((d) => setAccounts(d.users)).catch((e: Error) => toast(e.message));
  }, [toast]);

  const games = config?.tournament.games ?? [];
  // 팀이 해당 라운드에서 낸 점수. 경기가 끝나지 않았으면 없음.
  const gameScore = (teamId: string, round: string): number | null => {
    const g = games.find((x) => x.round === round && x.status === 'done' && (x.teamA === teamId || x.teamB === teamId));
    if (!g) return null;
    return (g.teamA === teamId ? g.scoreA : g.scoreB) ?? null;
  };

  const rows = accounts
    .filter((a) => (role ? a.role === role : true))
    .filter((a) => (q ? a.id.toLowerCase().includes(q.toLowerCase()) || a.name.toLowerCase().includes(q.toLowerCase()) : true));

  return (
    <section className={`${card} p-6`}>
      <h1 className="text-3xl font-extrabold text-heading">사용자 현황</h1>
      <p className="mt-2 text-sm text-gray-500">모든 계정과 팀별 1·2라운드·토너먼트 점수입니다. 점수가 없으면 -로 표시합니다. 비밀번호를 잊었을 때는 행별 '초기화'로 새 임시 비밀번호를 발급합니다. 평문 비밀번호는 CSV 로 저장되고 화면에 한 번만 표시됩니다.</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {ACCOUNT_ROLES.map((r) => (
          <button key={r.id} onClick={() => setRole(r.id)} className={`rounded-2xl border px-3 py-1.5 text-sm ${role === r.id ? 'border-accent bg-accent text-white' : 'border-line bg-white text-gray-600'}`}>{r.label}</button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="아이디·이름 검색" className="ml-auto rounded-xl border border-line bg-white px-3 py-1.5 text-sm" />
      </div>
      <div className="mt-4 overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="bg-accent text-white">
            <tr>
              <th className="px-3 py-3">아이디</th>
              <th className="px-3 py-3">구분</th>
              <th className="px-3 py-3">팀 / 이름</th>
              <th className="px-3 py-3 text-right">1R</th>
              <th className="px-3 py-3 text-right">2R</th>
              {T_ROUNDS.map((r) => <th key={r.id} className="px-3 py-3 text-right">{r.label}</th>)}
              <th className="px-3 py-3">마지막 로그인</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((a) => {
              const isTeam = a.role === 'user' && !!a.teamId;
              return (
                <tr key={a.id}>
                  <td className="px-3 py-2 font-medium">{a.id}</td>
                  <td className="px-3 py-2">{ROLE_LABEL[a.role]}</td>
                  <td className="px-3 py-2">{isTeam ? <>{a.teamId} · <TeamName id={a.teamId!} /></> : a.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{isTeam ? <Score value={scoreOf(a.teamId ?? undefined)?.r1} unit="" /> : '-'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{isTeam ? <Score value={scoreOf(a.teamId ?? undefined)?.r2} unit="" /> : '-'}</td>
                  {T_ROUNDS.map((r) => <td key={r.id} className="px-3 py-2 text-right tabular-nums">{isTeam ? <Score value={gameScore(a.teamId!, r.id)} unit="" /> : '-'}</td>)}
                  <td className="px-3 py-2 text-gray-500">{a.lastLoginAt ? timeAgo(a.lastLoginAt) : '미접속'}</td>
                  <td className="px-3 py-2 text-right"><button className={btn} onClick={() => resetPasswordOne(toast, a)}>비밀번호 초기화</button></td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={10} className="px-3 py-6 text-center text-gray-400">표시할 계정이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
