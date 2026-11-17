'use client';

import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/Toast';
import { teamName, useContest, withRanks, refreshContest, tablesOf, type Standing } from '@/lib/contest';
import { type Category } from '@/lib/judge/rules';
import { adminFetch, btn, card, downloadCsv, Icon, timeAgo } from './shared';

export type AccountRow = {
  id: string;
  name: string;
  role: 'user' | 'judge' | 'admin';
  teamId: string | null;
  judgeTable: number | null;
  mustChange: number;
  createdAt: number;
  lastLoginAt: number | null;
};

// 한 계정 비밀번호 초기화: 평문은 이번 한 번만 CSV 로 저장하고 토스트로도 보여준다
export async function resetPasswordOne(toast: (m: string) => void, a: { id: string; name: string; role: string }) {
  if (!confirm(`${a.id} 의 비밀번호를 초기화할까요? 새 임시 비밀번호가 발급되며 로그인 중이면 로그아웃됩니다.`)) return;
  try {
    const d = await adminFetch<{ reset: { id: string; name: string; role: string; password: string }[] }>('/admin/accounts/reset-password', { method: 'POST', body: { ids: [a.id] } });
    const roleLabel = (r: string) => (r === 'admin' ? '관리자' : r === 'judge' ? '심판' : '참가자');
    downloadCsv(`password-reset-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['아이디', '이름', '역할', '새 비밀번호'],
      ...d.reset.map((r) => [r.id, r.name, roleLabel(r.role), r.password]),
    ]);
    const first = d.reset[0];
    toast(first ? `${first.id} 새 비밀번호: ${first.password}` : '비밀번호를 초기화했습니다.');
  } catch (e) {
    toast((e as Error).message);
  }
}

function Stat({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <div className={`${card} p-5`}>
      <p className="text-sm text-gray-500">{title}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-gray-400">{sub}</p>
    </div>
  );
}

export default function Teams() {
  const toast = useToast();
  const { config } = useContest();
  const teams = config?.teams ?? [];
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [accountsTotal, setAccountsTotal] = useState(0);
  const issueInput = useRef<HTMLInputElement>(null);

  const loadAccounts = () =>
    adminFetch<{ users: AccountRow[]; total: number }>('/admin/users')
      .then((d) => {
        setAccounts(d.users);
        setAccountsTotal(d.total);
      })
      .catch((e: Error) => toast(e.message));

  useEffect(() => {
    let alive = true;
    loadAccounts().then(() => {
      if (!alive) return;
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  // 계정 발급용 CSV: 아이디,이름,역할(judge/admin),담당 조(선택, 1~8). 헤더 줄과 # 주석은 건다른다.
  const issueCsv = async (file: File) => {
    const text = await file.text();
    const accounts: { id: string; name: string; role: 'judge' | 'admin'; table?: number }[] = [];
    for (const line of text.split(/\r?\n/)) {
      const cols = line.split(',').map((c) => c.trim());
      const [id, name, role, table] = cols;
      if (!id || id.startsWith('#') || id.toLowerCase() === 'id') continue;
      if (role !== 'judge' && role !== 'admin') return toast(`역할은 judge/admin 이어야 합니다 — ${line}`);
      if (table && (!/^[1-8]$/.test(table))) return toast(`담당 조는 1~8 입니다 — ${line}`);
      accounts.push({ id, name: name || id, role, table: table ? Number(table) : undefined });
    }
    if (accounts.length === 0) return toast('발급할 계정이 없습니다. 형식: 아이디,이름,역할,담당조(선택)');
    try {
      const d = await adminFetch<{ issued: { id: string; name: string; role: string; password: string }[] }>('/admin/accounts/issue', { method: 'POST', body: { accounts } });
      downloadCsv(`issued-accounts-${new Date().toISOString().slice(0, 10)}.csv`, [
        ['아이디', '이름', '역할', '새 비밀번호'],
        ...d.issued.map((r) => [r.id, r.name, r.role === 'admin' ? '관리자' : '심판', r.password]),
      ]);
      toast(`${d.issued.length}개 계정을 발급했습니다. 비밀번호 CSV를 안전하게 배포하세요.`);
      await loadAccounts();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const assignTable = async (id: string, table: number | null) => {
    try {
      await adminFetch('/admin/accounts/assign', { method: 'POST', body: { id, table } });
      setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, judgeTable: table } : a)));
      toast(`${id} 담당 조를 ${table ? `${table}조` : '미지정'}로 저장했습니다.`);
      refreshContest();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const junior = teams.filter((t) => t.cat === 'J').length;
  const senior = teams.filter((t) => t.cat === 'S').length;
  const dayAgo = Date.now() - 24 * 3600_000;
  const active = accounts.filter((a) => a.lastLoginAt !== null && a.lastLoginAt > dayAgo).length;
  const never = accounts.filter((a) => a.lastLoginAt === null).length;
  const staff = accounts.filter((a) => a.role !== 'user');
  const participants = accounts.filter((a) => a.role === 'user');

  // 소속별 팀 명단: /standings 순위(부문 내 경쟁 순위)를 붙여 org 마다 파일로 저장한다
  const exportByOrg = async () => {
    try {
      const d = await adminFetch<{ standings: Standing[] }>('/standings');
      const rankMap = new Map<string, number>();
      for (const c of ['S', 'J'] as Category[]) {
        for (const r of withRanks(d.standings, c)) rankMap.set(`${c}:${r.teamId}`, r.rank);
      }
      const standOf = (id: string) => d.standings.find((s) => s.teamId === id);
      const byOrg = new Map<string, typeof teams>();
      for (const t of teams) {
        byOrg.set(t.org, [...(byOrg.get(t.org) ?? []), t]);
      }
      for (const [org, list] of byOrg) {
        const rows: (string | number)[][] = [
          ['팀ID', '팀명', '팀코드', '부문', '지역', '지도자', '참가자', '최고점', '합계', '부문내순위'],
          ...list.map((t) => {
            const s = standOf(t.id);
            return [t.id, t.name, t.code, t.cat === 'J' ? '주니어' : '시니어', t.region, t.coach, t.members.join(' '), s?.total ?? '', s?.sum ?? '', rankMap.get(`${t.cat}:${t.id}`) ?? ''];
          }),
        ];
        const safe = org.replace(/[\\/:*?"<>|]/g, '_').trim() || '소속없음';
        downloadCsv(`${safe}-팀명단.csv`, rows);
        await new Promise((r) => setTimeout(r, 300)); // 브라우저가 연속 다운로드를 막지 않게 간격을 둔다
      }
      toast(`${byOrg.size}개 소속의 팀 명단 CSV를 다운로드했습니다.`);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const exportAccounts = () => {
    const header = ['아이디', '이름', '역할', '담당조', '마지막 로그인'];
    const body = staff.map((a) => [a.id, a.name, a.role === 'admin' ? '관리자' : '심판', a.judgeTable ?? '', a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString('ko-KR') : '']);
    downloadCsv(`accounts-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
  };

  const resetJudgePasswords = async () => {
    if (!confirm('모든 심판 계정의 비밀번호를 재발급할까요? 새 임시 비밀번호가 발급되며 로그인 중인 세션은 끊깁니다.')) return;
    try {
      const d = await adminFetch<{ reset: { id: string }[] }>('/admin/accounts/reset-password', { method: 'POST', body: { role: 'judge' } });
      toast(`심판 ${d.reset.length}개 계정의 비밀번호를 초기화했습니다.`);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <section className={`${card} p-6`}>
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold text-heading">팀 · 계정</h1>
        <div className="flex gap-2">
          <input
            ref={issueInput}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void issueCsv(f);
              e.target.value = '';
            }}
          />
          <button className={`${btn} inline-flex items-center gap-1`} onClick={() => issueInput.current?.click()}><Icon name="upload" />계정 발급 (CSV)</button>
          <button className={`${btn} inline-flex items-center gap-1`} onClick={exportAccounts}><Icon name="download" />계정 CSV</button>
          <button className={`${btn} inline-flex items-center gap-1`} onClick={() => void exportByOrg()}><Icon name="download" />소속별 CSV</button>
          <button className={btn} onClick={resetJudgePasswords}>심판 비밀번호 일괄 초기화</button>
        </div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat title="참가팀" value={String(teams.length)} sub={`주니어 ${junior} · 시니어 ${senior}`} />
        <Stat title="활성 계정" value={`${active} / ${accounts.length}`} sub="최근 24시간" />
        <Stat title="미접속" value={String(never)} sub="한 번도 로그인 안 함" />
      </div>
      <div className="mt-6 overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead className="bg-accent text-white">
            <tr>
              <th className="px-4 py-3">부문</th>
              <th className="px-4 py-3">팀</th>
              <th className="px-4 py-3">팀코드</th>
              <th className="px-4 py-3">지역 · 소속</th>
              <th className="px-4 py-3">지도자</th>
              <th className="px-4 py-3">참가자</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {teams.map((team) => (
              <tr key={team.id}>
                <td className="px-4 py-3">{team.cat === 'J' ? '주니어' : '시니어'}</td>
                <td className="px-4 py-3 font-medium">{team.id} · {team.name}</td>
                <td className="px-4 py-3">{team.code}</td>
                <td className="px-4 py-3">{team.region} · {team.org}</td>
                <td className="px-4 py-3">{team.coach}</td>
                <td className="px-4 py-3">{team.members.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="mt-8 font-semibold">심판 · 관리자 계정</h2>
      <div className="mt-3 overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-accent text-white">
            <tr>
              <th className="px-4 py-3">아이디</th>
              <th className="px-4 py-3">이름</th>
              <th className="px-4 py-3">역할</th>
              <th className="px-4 py-3">담당 조</th>
              <th className="px-4 py-3">마지막 로그인</th>
              <th className="px-4 py-3">임시 비밀번호</th>
              <th className="px-4 py-3">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {staff.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-3 font-medium">{a.id}</td>
                <td className="px-4 py-3">{a.name}</td>
                <td className="px-4 py-3">{a.role === 'admin' ? '관리자' : '심판'}</td>
                <td className="px-4 py-3">
                  {a.role === 'judge' ? (
                    <select
                      value={a.judgeTable ?? ''}
                      onChange={(e) => assignTable(a.id, e.target.value === '' ? null : Number(e.target.value))}
                      className="rounded-lg border border-line bg-white px-1.5 py-1 text-sm"
                      aria-label={`${a.name} 담당 조`}
                    >
                      <option value="">미지정</option>
                      {tablesOf(config?.matches ?? []).map((t) => <option key={t} value={t}>{t}조</option>)}
                    </select>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500">{a.lastLoginAt ? timeAgo(a.lastLoginAt) : '미접속'}</td>
                <td className="px-4 py-3">{a.mustChange ? <span className="text-xs font-semibold text-error">변경 필요</span> : '-'}</td>
                <td className="px-4 py-3"><button className={`${btn} !py-1`} onClick={() => resetPasswordOne(toast, a)}>초기화</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="mt-8 font-semibold">참가자 계정</h2>
      <div className="mt-3 overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-accent text-white">
            <tr>
              <th className="px-4 py-3">아이디</th>
              <th className="px-4 py-3">이름</th>
              <th className="px-4 py-3">팀</th>
              <th className="px-4 py-3">마지막 로그인</th>
              <th className="px-4 py-3">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {participants.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-3 font-medium">{a.id}</td>
                <td className="px-4 py-3">{a.name}</td>
                <td className="px-4 py-3">{a.teamId ? `${a.teamId} · ${teamName(teams, a.teamId)}` : '-'}</td>
                <td className="px-4 py-3 text-gray-500">{a.lastLoginAt ? timeAgo(a.lastLoginAt) : '미접속'}</td>
                <td className="px-4 py-3"><button className={`${btn} !py-1`} onClick={() => resetPasswordOne(toast, a)}>초기화</button></td>
              </tr>
            ))}
            {participants.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">참가자 계정이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
