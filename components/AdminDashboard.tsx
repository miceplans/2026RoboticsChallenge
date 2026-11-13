'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/Toast';
import { refreshContest, tablesOf, teamName, useContest, type Team } from '@/lib/contest';
import { CATEGORY_NAMES, ITEMS, parseTemplate, type Category, type Item } from '@/lib/judge/rules';
import { BracketCanvas, SEED_ORDER, useRanking } from './TournamentBracket';

type Tab = 'dashboard' | 'users' | 'scores' | 'template' | 'draw' | 'teams' | 'settings';

const nav: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: '대시보드', icon: 'dashboard' },
  { id: 'users', label: '심사 점수', icon: 'leaderboard' },
  { id: 'scores', label: '채점 목록', icon: 'fact_check' },
  { id: 'template', label: '채점표 템플릿', icon: 'table_chart' },
  { id: 'draw', label: '토너먼트 배정', icon: 'shuffle' },
  { id: 'teams', label: '팀 · 계정', icon: 'group' },
  { id: 'settings', label: '설정', icon: 'settings' },
];

const card = 'rounded-2xl border border-line bg-white';
const btn = 'rounded-2xl border border-line px-3 py-2 text-sm font-semibold hover:border-line-hover';
const btnPrimary = 'rounded-2xl bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-soft';

// --- 서버 통신 공통 ---

const serverUrl = () => process.env.NEXT_PUBLIC_REALTIME_URL ?? `${location.protocol}//${location.hostname}:4000`;

async function adminFetch<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${serverUrl()}${path}`, {
    method: init?.method ?? 'GET',
    credentials: 'include',
    headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json().catch(() => null)) as ({ ok: boolean; error?: string } & T) | null;
  if (!res.ok || !data?.ok) throw new Error(data?.error ?? `요청 실패 (${res.status})`);
  return data;
}

function downloadCsv(name: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + rows.map((r) => r.map(esc).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

const timeAgo = (ts: number) => {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}초 전`;
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
};

const STATUS_LABEL: Record<string, string> = { pending: '확정 대기', confirmed: '확정', modified: '수정됨', rejected: '반려' };

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined select-none ${className}`} style={{ fontSize: 20 }} aria-hidden>{name}</span>;
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

function Progress({ label, done, pct }: { label: string; done: string; pct: number }) {
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-gray-500">{done}</span>
      </div>
      <div className="mt-2 h-1.5 bg-surface-secondary">
        <div className="h-full bg-accent" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

// --- 대시보드 ---

type Overview = {
  matches: { total: number; done: number };
  pendingCount: number;
  judges: { id: string; name: string; table: number | null; submitted: number; total: number }[];
  users: { total: number; active24h: number; neverLoggedIn: number };
  scores: { total: number; pending: number; confirmed: number; modified: number; rejected: number };
};
type Activity = { id: number; ts: number; actorName?: string | null; action: string; entityId: string | null };
type Pending = { matchId: string; teamId: string; teamName: string | null; judgeId: string; judgeName: string | null; points: number; ts: number };

const ACTIVITY_VERB: Record<string, string> = {
  submit: '채점표를 제출했습니다',
  confirm: '점수를 확정했습니다',
  modify: '점수를 정정했습니다',
  reject: '채점을 반려했습니다',
  teams: '팀 명단을 변경했습니다',
  matches: '대진을 변경했습니다',
  settings: '설정을 변경했습니다',
  template: '채점표 템플릿을 변경했습니다',
  issue: '계정을 발급했습니다',
  reset_password: '비밀번호를 재발급했습니다',
  tournament: '토너먼트 배정을 변경했습니다',
  login: '로그인했습니다',
};

function Dashboard({ go }: { go: (t: Tab) => void }) {
  const toast = useToast();
  const [ov, setOv] = useState<Overview | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () => {
      Promise.all([
        adminFetch<{ overview: Overview }>('/admin/overview'),
        adminFetch<{ activity: Activity[] }>('/admin/activity?limit=30'),
        adminFetch<{ pending: Pending[]; total: number }>('/admin/pending'),
      ])
        .then(([o, a, p]) => {
          if (!alive) return;
          setOv(o.overview);
          setActivity(a.activity);
          setPending(p.pending);
          setPendingTotal(p.total);
        })
        .catch((e: Error) => toast(e.message));
    };
    load();
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, 10_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [toast]);

  const submittedJudges = ov ? ov.judges.filter((j) => j.submitted > 0).length : 0;
  const pct = ov && ov.matches.total > 0 ? (ov.matches.done / ov.matches.total) * 100 : 0;

  return (
    <>
      <h1 className="text-3xl font-extrabold text-heading">대시보드</h1>
      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat title="전체 경기" value={ov ? String(ov.matches.total) : '…'} sub={ov ? `완료 ${ov.matches.done}` : ''} />
        <Stat title="경기 진행률" value={`${pct.toFixed(1)}%`} sub="" />
        <Stat title="확정 대기" value={ov ? String(ov.pendingCount) : '…'} sub="" />
        <Stat title="제출 심판" value={ov ? `${submittedJudges} / ${ov.judges.length}` : '…'} sub={ov ? `미제출 ${ov.judges.length - submittedJudges}명` : ''} />
      </section>
      <section className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
        <div className={`${card} p-6`}>
          <h2 className="font-semibold">경기 진행 현황</h2>
          <div className="mt-6">
            <Progress label="조별 라운드 (1·2차)" done={ov ? `${ov.matches.done} / ${ov.matches.total}` : '…'} pct={pct} />
          </div>
          {ov && (
            <p className="mt-4 text-sm text-gray-500">
              점수 {ov.scores.total}건 · 확정 {ov.scores.confirmed} · 확정 대기 {ov.scores.pending} · 정정 {ov.scores.modified} · 반려 {ov.scores.rejected}
            </p>
          )}
        </div>
        <div className={`${card} p-6`}>
          <h2 className="font-semibold">심판별 제출 현황</h2>
          <div className="mt-5 space-y-4">
            {(ov?.judges ?? []).map((j) => (
              <div key={j.id}>
                <div className="flex justify-between text-sm">
                  <span>{j.name} <span className="text-gray-400">{j.table ? `테이블 ${j.table}` : j.id}</span></span>
                  <span className="tabular-nums">{j.submitted} / {j.total}</span>
                </div>
                <div className="mt-2 h-1.5 bg-surface-secondary">
                  <div className="h-full bg-accent" style={{ width: `${j.total > 0 ? (j.submitted / j.total) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
            {!ov && <p className="text-sm text-gray-400">불러오는 중…</p>}
          </div>
        </div>
      </section>
      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <div className={card}>
          <div className="flex items-center justify-between px-6 py-4">
            <h2 className="font-semibold">확정 대기{pendingTotal > pending.length ? ` ${pendingTotal}건` : ''}</h2>
            <button className="text-sm text-gray-500 underline" onClick={() => go('scores')}>전체 보기</button>
          </div>
          <div>
            {pending.length === 0 && <p className="px-6 py-4 text-sm text-gray-400">확정 대기 중인 채점이 없습니다.</p>}
            {pendingTotal > pending.length && <p className="px-6 py-2 text-xs text-gray-400">최신 {pending.length}걸 표시 중입니다</p>}
            {pending.slice(0, 8).map((p) => (
              <div className="flex items-center gap-3 px-6 py-3" key={`${p.matchId}/${p.teamId}/${p.judgeId}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-500">{p.matchId} · 심판 {p.judgeName ?? p.judgeId} · {p.points}점</p>
                  <p className="truncate text-sm font-medium">{p.teamName ?? p.teamId}</p>
                </div>
                <span className="hidden text-xs text-gray-400 sm:block">{timeAgo(p.ts)}</span>
                <button className={btn} onClick={() => go('scores')}>검토</button>
              </div>
            ))}
          </div>
        </div>
        <div className={card}>
          <div className="px-6 py-4"><h2 className="font-semibold">활동 로그</h2></div>
          <div>
            {activity.length === 0 && <p className="px-6 py-4 text-sm text-gray-400">아직 기록이 없습니다.</p>}
            {activity.slice(0, 12).map((a) => (
              <div className="px-6 py-3" key={a.id}>
                <p className="text-sm">
                  <b className="font-medium">{a.actorName || '시스템'}</b>{' '}
                  {ACTIVITY_VERB[a.action] ?? a.action}
                  {a.entityId && a.action !== 'login' && <span className="text-gray-500"> · {a.entityId}</span>}
                </p>
                <p className="mt-0.5 text-xs text-gray-400">{timeAgo(a.ts)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

// --- 심사 점수 (1·2라운드 심사 점수 — 서버 저장) ---

type RoundScores = Record<string, { r1: string; r2: string }>;

function Users() {
  const toast = useToast();
  const [cat, setCat] = useState<Category>('S');
  const [scores, setScores] = useState<RoundScores>({});
  const [dirty, setDirty] = useState(false);
  const { config } = useContest();
  const teams = config?.teams ?? [];

  useEffect(() => {
    adminFetch<{ settings: { roundScores: RoundScores } }>('/admin/settings')
      .then((d) => setScores(d.settings.roundScores ?? {}))
      .catch((e: Error) => toast(e.message));
  }, [toast]);

  const save = async () => {
    try {
      await adminFetch('/admin/settings', { method: 'PUT', body: { roundScores: scores } });
      setDirty(false);
      toast('저장했습니다.');
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const set = (id: string, key: 'r1' | 'r2', v: string) => {
    setScores((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { r1: '', r2: '' }), [key]: v } }));
    setDirty(true);
  };

  const num = (v?: string) => (v === undefined || v.trim() === '' || isNaN(Number(v)) ? null : Number(v));
  const rows = teams.filter((t) => t.cat === cat).map((t) => {
    const r1 = num(scores[t.id]?.r1);
    const r2 = num(scores[t.id]?.r2);
    return { team: t, r1, r2, total: r1 === null && r2 === null ? null : (r1 ?? 0) + (r2 ?? 0) };
  });
  // 동점이면 같은 순위(1, 1, 3 …). 점수가 하나도 없는 팀은 순위 없음. 소수점 합산 오차를 무시하기 위해 근사 비교한다.
  const ranked = rows.filter((r) => r.total !== null).map((r) => r.total as number).sort((a, b) => b - a);
  const rankOf = (total: number | null) => {
    if (total === null) return null;
    const i = ranked.findIndex((t) => Math.abs(t - total) < 1e-9);
    return i < 0 ? null : i + 1;
  };

  return (
    <section className={`${card} p-6`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl font-extrabold text-heading">심사 점수</h1>
        <div className="flex gap-2">
          <button className={btn} onClick={() => { if (confirm(`${CATEGORY_NAMES[cat]} 점수를 모두 지울까요?`)) { setScores((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => teams.find((t) => t.id === id)?.cat !== cat))); setDirty(true); } }}>점수 초기화</button>
          <button className={`${btnPrimary} disabled:opacity-40`} disabled={!dirty} onClick={save}>{dirty ? '저장' : '저장됨'}</button>
        </div>
      </div>
      <p className="mt-2 text-sm text-gray-500">1·2라운드 심사 점수를 입력하면 합계와 순위가 자동으로 계산됩니다. (서버에 저장됩니다)</p>
      <nav className="mt-4 flex gap-2 border-b border-line">
        {(['S', 'J'] as Category[]).map((c) => (
          <button key={c} onClick={() => setCat(c)} className={`px-4 py-2 text-sm font-bold ${cat === c ? 'border-b-2 border-accent text-accent' : 'text-gray-500'}`}>{CATEGORY_NAMES[c]}</button>
        ))}
      </nav>
      <div className="mt-5 overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-accent text-white">
            <tr>
              <th className="px-4 py-3 font-semibold">팀</th>
              <th className="px-4 py-3 font-semibold">소속</th>
              <th className="px-4 py-3 text-right font-semibold">1라운드</th>
              <th className="px-4 py-3 text-right font-semibold">2라운드</th>
              <th className="px-4 py-3 text-right font-semibold">합계</th>
              <th className="px-4 py-3 text-right font-semibold">순위(자동집계)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(({ team, total }) => {
              const rank = rankOf(total);
              return (
                <tr key={team.id}>
                  <td className="px-4 py-2 font-medium">{team.id} · {team.name}</td>
                  <td className="px-4 py-2 text-gray-600">{team.region} · {team.org}</td>
                  {(['r1', 'r2'] as const).map((k) => (
                    <td key={k} className="px-4 py-2 text-right">
                      <input
                        type="number" inputMode="decimal" min={0} step="any"
                        value={scores[team.id]?.[k] ?? ''}
                        onChange={(e) => set(team.id, k, e.target.value)}
                        aria-label={`${team.name} ${k === 'r1' ? '1' : '2'}라운드 점수`}
                        className="w-24 rounded-lg border border-line bg-white px-2 py-1 text-right tabular-nums"
                      />
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">{total ?? '-'}</td>
                  <td className={`px-4 py-2 text-right font-bold tabular-nums ${rank && rank <= 3 ? 'text-accent' : ''}`}>{rank ?? '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// --- 채점 목록 ---

type ScoreRow = { matchId: string; teamId: string; judgeId: string; points: number; ts: number; status: string; cat: 'J' | 'S' | null };

const SCORE_FILTERS = [
  { id: '', label: '전체' },
  { id: 'pending', label: '확정 대기' },
  { id: 'confirmed', label: '확정' },
  { id: 'modified', label: '수정됨' },
  { id: 'rejected', label: '반려' },
];

function ScoreList() {
  const toast = useToast();
  const { config } = useContest();
  const teams = config?.teams ?? [];
  const [filter, setFilter] = useState('');
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [total, setTotal] = useState(0);

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
        <button className={btn} onClick={exportCsv}><span className="inline-flex items-center gap-1"><Icon name="download" />CSV 내보내기</span></button>
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
    </section>
  );
}

// --- 채점표 템플릿 ---

function Template() {
  const toast = useToast();
  const { config } = useContest();
  const [items, setItems] = useState<Item[]>(ITEMS);
  const [dirty, setDirty] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current || config === null) return;
    initialized.current = true;
    setItems(parseTemplate(config.template) ?? ITEMS);
  }, [config]);

  const patch = (i: number, p: Partial<Item>) => {
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...p } : it)));
    setDirty(true);
  };
  const save = async () => {
    try {
      await adminFetch('/admin/template', { method: 'PUT', body: { items } });
      setDirty(false);
      toast('채점표 템플릿을 저장했습니다. 심판 화면에 즉시 반영됩니다.');
      refreshContest();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const reset = async () => {
    if (!confirm('기본 채점표로 복원할까요?')) return;
    try {
      await adminFetch('/admin/template/reset', { method: 'POST' });
      setItems(ITEMS);
      setDirty(false);
      toast('기본값으로 복원했습니다.');
      refreshContest();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <section className={`${card} p-6`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl font-extrabold text-heading">채점표 템플릿</h1>
        <div className="flex gap-2">
          <button className={btn} onClick={reset}>기본값 복원</button>
          <button className={`${btnPrimary} disabled:opacity-40`} disabled={!dirty} onClick={save}>{dirty ? '저장' : '저장됨'}</button>
        </div>
      </div>
      <p className="mt-2 text-sm text-gray-500">저장하면 심판 채점 화면의 항목과 배점이 즉시 바뀝니다. 시니어 배점이 0인 항목은 시니어 화면에 표시되지 않습니다.</p>
      <div className="mt-5 overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-accent text-white">
            <tr>
              <th className="px-4 py-3 font-semibold">채점 항목</th>
              <th className="px-4 py-3 font-semibold">미션</th>
              <th className="px-4 py-3 font-semibold">입력</th>
              <th className="px-4 py-3 font-semibold">최대 개수</th>
              <th className="px-4 py-3 font-semibold">주니어</th>
              <th className="px-4 py-3 font-semibold">시니어</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((it, i) => (
              <tr key={it.id}>
                <td className="px-4 py-2">
                  <input value={it.label} onChange={(e) => patch(i, { label: e.target.value })} className="w-full min-w-[220px] rounded-lg border border-line bg-white px-2 py-1" />
                </td>
                <td className="px-4 py-2">
                  <select value={it.m} onChange={(e) => patch(i, { m: e.target.value as Item['m'] })} className="rounded-lg border border-line bg-white px-2 py-1">
                    <option value="M1">M1</option>
                    <option value="M2">M2</option>
                    <option value="PEN">감점</option>
                  </select>
                </td>
                <td className="px-4 py-2">
                  <select value={it.type} onChange={(e) => patch(i, { type: e.target.value as Item['type'] })} className="rounded-lg border border-line bg-white px-2 py-1">
                    <option value="count">개수</option>
                    <option value="bool">여부</option>
                    <option value="auto">자동 계산</option>
                    <option value="manual">직접 입력</option>
                  </select>
                </td>
                <td className="px-4 py-2">
                  <input type="number" min={1} value={it.max ?? ''} disabled={it.type !== 'count'} onChange={(e) => patch(i, { max: e.target.value === '' ? undefined : Number(e.target.value) })} className="w-20 rounded-lg border border-line bg-white px-2 py-1 text-right tabular-nums disabled:opacity-40" />
                </td>
                <td className="px-4 py-2">
                  <input type="number" value={it.pj} onChange={(e) => patch(i, { pj: Number(e.target.value) })} className="w-20 rounded-lg border border-line bg-white px-2 py-1 text-right tabular-nums" />
                </td>
                <td className="px-4 py-2">
                  <input type="number" value={it.ps} onChange={(e) => patch(i, { ps: Number(e.target.value) })} className="w-20 rounded-lg border border-line bg-white px-2 py-1 text-right tabular-nums" />
                </td>
                <td className="px-4 py-2 text-right">
                  <button className={`${btn} !py-1`} onClick={() => { setItems((prev) => prev.filter((_, j) => j !== i)); setDirty(true); }}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-6">
        <button
          className={`${btnPrimary} inline-flex items-center gap-1`}
          onClick={() => { setItems((prev) => [...prev, { id: `x${Date.now()}`, m: 'M1', label: '새 항목', type: 'count', max: 1, pj: 0, ps: 0 }]); setDirty(true); }}
        >
          <Icon name="add" />항목 추가
        </button>
      </div>
    </section>
  );
}

// --- 토너먼트 배정 ---

function Draw() {
  const toast = useToast();
  const [cat, setCat] = useState<Category>('S');
  const ranking = useRanking(cat);
  const { config } = useContest();
  const teams = config?.teams ?? [];
  const [slots, setSlots] = useState<(string | undefined)[]>(Array(16).fill(undefined));
  const [applied, setApplied] = useState(false);
  const loadedCat = useRef<Category | null>(null);

  // 저장된 배정이 있으면 그대로 불러온다 (탭 진입 시 한 번)
  useEffect(() => {
    if (loadedCat.current === cat || !config) return;
    loadedCat.current = cat;
    const saved = config.tournament.slots.filter((s) => s.cat === cat).sort((a, b) => a.slotNo - b.slotNo);
    if (saved.length === 16) {
      setSlots(saved.map((s) => s.teamId ?? undefined));
      setApplied(saved.every((s) => s.teamId));
    }
  }, [cat, config]);

  const placed = new Set(slots.filter(Boolean));
  const count = placed.size;
  const complete = count === Math.min(16, ranking.length) && count > 0;

  const change = (fn: (prev: (string | undefined)[]) => (string | undefined)[]) => {
    setSlots(fn);
    setApplied(false);
  };
  const switchCat = (c: Category) => {
    setCat(c);
    setSlots(Array(16).fill(undefined));
    setPicked(undefined);
    setApplied(false);
  };
  const [picked, setPicked] = useState<string>();
  const onDrop = (slot: number, payload: string) => {
    const [kind, val] = payload.split(':');
    change((prev) => {
      const next = [...prev];
      if (kind === 'slot') {
        const from = Number(val);
        [next[from], next[slot]] = [next[slot], next[from]]; // 칸끼리는 자리 교환
      } else if (kind === 'team') {
        const old = next.indexOf(val);
        if (old >= 0) next[old] = undefined;
        next[slot] = val;
      }
      return next;
    });
    setPicked(undefined);
  };
  const onClear = (slot: number) => change((prev) => prev.map((t, i) => (i === slot ? undefined : t)));
  const autoFill = () => change(() => SEED_ORDER.map((seed) => ranking[seed - 1]?.teamId));

  const apply = async () => {
    try {
      await adminFetch('/admin/tournament/slots', { method: 'PUT', body: { cat, teamIds: slots.map((s) => s ?? null) } });
      setApplied(true);
      toast('토너먼트 대진을 저장했습니다. /contest 대진표에 반영됩니다.');
      refreshContest();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <section className={`${card} p-6`}>
      <h1 className="text-3xl font-extrabold text-heading">팀 토너먼트 배정</h1>
      <p className="mt-2 text-sm text-gray-500">1차·2차 점수를 합산한 순위입니다. 팀을 끌어서 점선 칸에 놓고 저장하면 /contest 대진표에 반영됩니다. (터치: 팀을 누른 뒤 칸을 누르세요)</p>
      <nav className="mt-4 flex gap-2 border-b border-line">
        {(['S', 'J'] as Category[]).map((c) => (
          <button key={c} onClick={() => switchCat(c)} className={`px-4 py-2 text-sm font-bold ${cat === c ? 'border-b-2 border-accent text-accent' : 'text-gray-500'}`}>{CATEGORY_NAMES[c]}</button>
        ))}
      </nav>
      <div className="mt-6 grid gap-6 xl:grid-cols-[260px_1fr]">
        <div
          className="rounded bg-[#e5f3ff] p-4"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const [kind, val] = e.dataTransfer.getData('text/plain').split(':');
            if (kind === 'slot') onClear(Number(val));
          }}
        >
          <div className="flex items-center justify-between"><h2 className="font-semibold">합산 순위</h2><span className="text-xs text-gray-500">{count}/16 배치</span></div>
          <ol className="mt-3 space-y-2">
            {ranking.map((r, i) => {
              const used = placed.has(r.teamId);
              return (
                <li key={r.teamId}>
                  <button
                    type="button"
                    draggable={!used}
                    disabled={used}
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', `team:${r.teamId}`)}
                    onClick={() => setPicked((p) => (p === r.teamId ? undefined : r.teamId))}
                    className={`flex w-full items-center gap-2 rounded border bg-white px-3 py-2 text-left text-sm ${picked === r.teamId ? 'border-accent' : 'border-line'} ${used ? 'opacity-40' : 'cursor-grab hover:border-line-hover'}`}
                  >
                    <span className="w-6 font-bold tabular-nums text-accent">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{teamName(teams, r.teamId)}</span>
                    <span className="tabular-nums text-gray-500">{r.total}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="mt-4 flex gap-2">
            <button onClick={autoFill} className={btn}>시드 자동 배치</button>
            <button onClick={() => change(() => Array(16).fill(undefined))} className={btn}>초기화</button>
          </div>
        </div>
        <div className="min-w-0">
          <div className="overflow-x-auto">
            <BracketCanvas slots={slots} seeding={{ slots, onDrop, onClear, picked }} />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button disabled={!complete} onClick={apply} className={`${btnPrimary} disabled:opacity-40`}>{applied ? '저장 완료 · 적용됨' : '토너먼트 저장 · 적용'}</button>
            {!complete && <span className="text-xs text-gray-500">모든 팀을 배치해 주세요</span>}
          </div>
          {applied && <p className="mt-3 rounded-xl bg-[#eaf5ff] p-3 text-sm text-[#258eed]">토너먼트 대진이 저장됐습니다. /contest 의 대진표 탭에서 확인하세요.</p>}
        </div>
      </div>
      <GameResults cat={cat} />
    </section>
  );
}

// --- 토너먼트 경기 결과 입력 ---

const ROUND_LABEL: Record<string, string> = { R16: '16강', QF: '8강', SF: '준결승', F: '결승', '3P': '3·4위전' };

function GameRow({ cat, round, gameNo, teamA, teamB, scoreA, scoreB, teams }: {
  cat: Category;
  round: 'R16' | 'QF' | 'SF' | 'F' | '3P';
  gameNo: number;
  teamA: string | null;
  teamB: string | null;
  scoreA: number | null;
  scoreB: number | null;
  teams: Team[];
}) {
  const toast = useToast();
  const [a, setA] = useState<string | number>(scoreA ?? '');
  const [b, setB] = useState<string | number>(scoreB ?? '');
  const [saving, setSaving] = useState(false);
  const ready = Boolean(teamA && teamB);

  const save = async () => {
    if (a === '' || b === '') return toast('양쪽 점수를 입력해 주세요.');
    if (Number(a) === Number(b)) return toast('무승부는 입력할 수 없습니다.');
    setSaving(true);
    try {
      await adminFetch('/admin/tournament/result', { method: 'POST', body: { cat, round, gameNo, scoreA: Number(a), scoreB: Number(b) } });
      toast(`${ROUND_LABEL[round]} ${gameNo}경기 결과를 저장했습니다.`);
      refreshContest();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const inputCls2 = 'w-20 rounded-lg border border-line bg-white px-2 py-1 text-right tabular-nums disabled:opacity-40';
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5 text-sm last:border-0">
      <span className="w-24 shrink-0 text-gray-500">{ROUND_LABEL[round]} {gameNo}</span>
      <span className="min-w-0 flex-1 font-medium">
        {teamA ? teamName(teams, teamA) : '—'} <span className="font-normal text-gray-400">vs</span> {teamB ? teamName(teams, teamB) : '—'}
      </span>
      <input type="number" inputMode="numeric" value={a} disabled={!ready} onChange={(e) => setA(e.target.value === '' ? '' : Number(e.target.value))} className={inputCls2} aria-label="A 팀 점수" />
      <span className="text-gray-400">:</span>
      <input type="number" inputMode="numeric" value={b} disabled={!ready} onChange={(e) => setB(e.target.value === '' ? '' : Number(e.target.value))} className={inputCls2} aria-label="B 팀 점수" />
      <button className={`${btn} !py-1 disabled:opacity-40`} disabled={!ready || saving} onClick={save}>저장</button>
    </div>
  );
}

function GameResults({ cat }: { cat: Category }) {
  const { config } = useContest();
  const teams = config?.teams ?? [];
  const slots = (config?.tournament.slots ?? []).filter((s) => s.cat === cat).sort((x, y) => x.slotNo - y.slotNo);
  const games = config?.tournament.games ?? [];
  const gameOf = (round: 'R16' | 'QF' | 'SF' | 'F' | '3P', gameNo: number) => games.find((g) => g.cat === cat && g.round === round && g.gameNo === gameNo);

  if (slots.length < 16) {
    return <p className="mt-8 text-sm text-gray-500">경기 결과 입력은 16개 팀 배정을 저장한 뒤 할 수 있습니다.</p>;
  }

  const rows: { key: string; round: 'R16' | 'QF' | 'SF' | 'F' | '3P'; gameNo: number; teamA: string | null; teamB: string | null; scoreA: number | null; scoreB: number | null; updatedAt: number }[] = [];
  for (let i = 1; i <= 8; i++) {
    const g = gameOf('R16', i);
    rows.push({ key: `R16-${i}`, round: 'R16', gameNo: i, teamA: slots[2 * i - 2]?.teamId ?? null, teamB: slots[2 * i - 1]?.teamId ?? null, scoreA: g?.scoreA ?? null, scoreB: g?.scoreB ?? null, updatedAt: g?.updatedAt ?? 0 });
  }
  for (let j = 1; j <= 4; j++) {
    const g = gameOf('QF', j);
    rows.push({ key: `QF-${j}`, round: 'QF', gameNo: j, teamA: g?.teamA ?? null, teamB: g?.teamB ?? null, scoreA: g?.scoreA ?? null, scoreB: g?.scoreB ?? null, updatedAt: g?.updatedAt ?? 0 });
  }
  for (let k = 1; k <= 2; k++) {
    const g = gameOf('SF', k);
    rows.push({ key: `SF-${k}`, round: 'SF', gameNo: k, teamA: g?.teamA ?? null, teamB: g?.teamB ?? null, scoreA: g?.scoreA ?? null, scoreB: g?.scoreB ?? null, updatedAt: g?.updatedAt ?? 0 });
  }
  const f = gameOf('F', 1);
  rows.push({ key: 'F-1', round: 'F', gameNo: 1, teamA: f?.teamA ?? null, teamB: f?.teamB ?? null, scoreA: f?.scoreA ?? null, scoreB: f?.scoreB ?? null, updatedAt: f?.updatedAt ?? 0 });
  const tp = gameOf('3P', 1);
  rows.push({ key: '3P-1', round: '3P', gameNo: 1, teamA: tp?.teamA ?? null, teamB: tp?.teamB ?? null, scoreA: tp?.scoreA ?? null, scoreB: tp?.scoreB ?? null, updatedAt: tp?.updatedAt ?? 0 });

  return (
    <div className="mt-8">
      <h2 className="font-semibold">경기 결과 입력</h2>
      <p className="mt-1 text-xs text-gray-500">승자가 다음 라운드로 진출하고, 준결승 패자는 3·4위전으로 갑니다. 저장한 결과를 고치면 하위 라운드도 다시 계산됩니다.</p>
      <div className={`${card} mt-3`}>
        {rows.map((r) => (
          <GameRow key={`${r.key}-${r.updatedAt}`} cat={cat} round={r.round} gameNo={r.gameNo} teamA={r.teamA} teamB={r.teamB} scoreA={r.scoreA} scoreB={r.scoreB} teams={teams} />
        ))}
      </div>
    </div>
  );
}

// --- 팀 · 계정 ---

type AccountRow = {
  id: string;
  name: string;
  role: 'user' | 'judge' | 'admin';
  teamId: string | null;
  judgeTable: number | null;
  mustChange: number;
  createdAt: number;
  lastLoginAt: number | null;
};

function Teams() {
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

  // 계정 발급용 CSV: 아이디,이름,역할(judge/admin),테이블(선택). 헤더 줄과 # 주석은 건다른다.
  const issueCsv = async (file: File) => {
    const text = await file.text();
    const accounts: { id: string; name: string; role: 'judge' | 'admin'; table?: number }[] = [];
    for (const line of text.split(/\r?\n/)) {
      const cols = line.split(',').map((c) => c.trim());
      const [id, name, role, table] = cols;
      if (!id || id.startsWith('#') || id.toLowerCase() === 'id') continue;
      if (role !== 'judge' && role !== 'admin') return toast(`역할은 judge/admin 이어야 합니다 — ${line}`);
      if (table && (!/^[1-8]$/.test(table))) return toast(`테이블은 1~8 입니다 — ${line}`);
      accounts.push({ id, name: name || id, role, table: table ? Number(table) : undefined });
    }
    if (accounts.length === 0) return toast('발급할 계정이 없습니다. 형식: 아이디,이름,역할,테이블(선택)');
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
      toast(`${id} 담당 테이블을 ${table ?? '미지정'}으로 저장했습니다.`);
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

  const exportAccounts = () => {
    const header = ['아이디', '이름', '역할', '담당테이블', '마지막 로그인'];
    const body = staff.map((a) => [a.id, a.name, a.role === 'admin' ? '관리자' : '심판', a.judgeTable ?? '', a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString('ko-KR') : '']);
    downloadCsv(`accounts-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
  };

  const resetJudgePasswords = async () => {
    if (!confirm('모든 심판 계정의 비밀번호를 재발급할까요? 기존 비밀번호는 즉시 쓸 수 없게 됩니다.')) return;
    try {
      const d = await adminFetch<{ reset: { id: string; name: string; password: string }[] }>('/admin/accounts/reset-password', { method: 'POST', body: { role: 'judge' } });
      const header = ['아이디', '이름', '새 비밀번호'];
      downloadCsv(`judge-passwords-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...d.reset.map((r) => [r.id, r.name, r.password])]);
      toast(`심판 ${d.reset.length}개 계정의 비밀번호를 재발급했습니다. CSV를 안전하게 배포하세요.`);
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
          <button className={btn} onClick={resetJudgePasswords}>비밀번호 일괄 재발급</button>
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
              <th className="px-4 py-3">담당 테이블</th>
              <th className="px-4 py-3">마지막 로그인</th>
              <th className="px-4 py-3">임시 비밀번호</th>
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
                      aria-label={`${a.name} 담당 테이블`}
                    >
                      <option value="">미지정</option>
                      {tablesOf(config?.matches ?? []).map((t) => <option key={t} value={t}>{t}번</option>)}
                    </select>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500">{a.lastLoginAt ? timeAgo(a.lastLoginAt) : '미접속'}</td>
                <td className="px-4 py-3">{a.mustChange ? <span className="text-xs font-semibold text-error">변경 필요</span> : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// --- 설정 ---

function Settings() {
  const toast = useToast();
  const { config, loaded } = useContest();
  const [flags, setFlags] = useState({ autoConfirm: true, boardPublic: true, hideScores: false });
  const [notice, setNotice] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!loaded) return;
    setFlags({
      autoConfirm: config?.settings.autoConfirm ?? true,
      boardPublic: config?.settings.boardPublic ?? true,
      hideScores: false,
    });
    setNotice(config?.settings.notice.message ?? '');
    adminFetch<{ settings: { hideScores: boolean } }>('/admin/settings')
      .then((d) => {
        setFlags((f) => ({ ...f, hideScores: d.settings.hideScores }));
      })
      .catch(() => {});
  }, [loaded, config]);

  const items: { key: keyof typeof flags; label: string; hint: string }[] = [
    { key: 'autoConfirm', label: '자동 확정', hint: '서명 완료 즉시 순위에 반영합니다. 끄면 관리자 확정이 필요합니다.' },
    { key: 'boardPublic', label: '보드 공개', hint: '순위판을 로그인한 모든 참가자에게 공개합니다. 끄면 관리자만 봅니다.' },
    { key: 'hideScores', label: '점수 가리기', hint: '참가자의 내 점수표 탭 조회를 막습니다.' },
  ];

  const save = async () => {
    try {
      await adminFetch('/admin/settings', { method: 'PUT', body: { autoConfirm: flags.autoConfirm, boardPublic: flags.boardPublic, hideScores: flags.hideScores, notice: { message: notice } } });
      setDirty(false);
      toast('설정을 저장했습니다. 접속 중인 화면에 즉시 반영됩니다.');
      refreshContest();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <section className={`${card} max-w-3xl p-6`}>
      <h1 className="text-3xl font-extrabold text-heading">설정</h1>
      <div className="mt-6 space-y-5">
        <label className="block">
          <span className="text-sm font-medium">공지</span>
          <textarea value={notice} onChange={(e) => { setNotice(e.target.value); setDirty(true); }} className="mt-2 h-24 w-full rounded-lg border border-line bg-white p-3 text-sm" placeholder="참가자 화면 상단에 표시할 공지 (비우면 숨김)" />
        </label>
        {items.map(({ key, label, hint }) => (
          <label key={label} className="flex cursor-pointer items-center justify-between gap-4 pt-4 text-sm">
            <span>
              {label}
              <span className="mt-0.5 block text-xs text-gray-400">{hint}</span>
            </span>
            <input
              type="checkbox"
              className="size-4 shrink-0 accent-accent"
              checked={flags[key]}
              onChange={() => { setFlags((f) => ({ ...f, [key]: !f[key] })); setDirty(true); }}
            />
          </label>
        ))}
      </div>
      <button className={`${btnPrimary} mt-6 disabled:opacity-40`} disabled={!dirty} onClick={save}>{dirty ? '저장' : '저장됨'}</button>
    </section>
  );
}

export default function AdminDashboard({ name }: { name: string }) {
  const [tab, setTab] = useState<Tab>('dashboard');
  const content =
    tab === 'users' ? <Users /> :
    tab === 'scores' ? <ScoreList /> :
    tab === 'template' ? <Template /> :
    tab === 'draw' ? <Draw /> :
    tab === 'teams' ? <Teams /> :
    tab === 'settings' ? <Settings /> :
    <Dashboard go={setTab} />;
  return (
    <div className="min-h-screen bg-surface text-gray-900">
      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col bg-white p-3 lg:flex">
          <Image src="/images/logo.png" alt="전국민 AI 경진대회" width={200} height={40} priority className="mb-4 h-8 w-auto self-start px-3 box-content" />
          {nav.map((item) => (
            <button key={item.id} onClick={() => setTab(item.id)} className={`mb-0.5 flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm ${tab === item.id ? 'bg-surface-secondary font-medium text-heading' : 'text-gray-600 hover:bg-surface'}`}>
              <Icon name={item.icon} />{item.label}
            </button>
          ))}
          <p className="mt-auto flex items-center gap-1 px-3 py-2 text-sm text-gray-600"><Icon name="person" />{name}</p>
        </aside>
        <main className="min-w-0 flex-1 p-5 sm:p-8">
          <div className="mx-auto max-w-[1200px]">
            <Image src="/images/logo.png" alt="전국민 AI 경진대회" width={200} height={40} className="mb-4 h-8 w-auto lg:hidden" />
            <div className="mb-6 flex gap-2 overflow-x-auto lg:hidden">
              {nav.map((x) => (
                <button key={x.id} onClick={() => setTab(x.id)} className={`whitespace-nowrap rounded-2xl border px-3 py-1.5 text-sm ${tab === x.id ? 'border-accent bg-accent text-white' : 'border-line bg-white text-gray-600'}`}>{x.label}</button>
              ))}
            </div>
            {content}
          </div>
        </main>
      </div>
    </div>
  );
}
