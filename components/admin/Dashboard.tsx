'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useToast } from '@/components/Toast';
import { adminFetch, btn, card, timeAgo } from './shared';

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

export default function Dashboard() {
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
            <Link href="/admin/scores" className="text-sm text-gray-500 underline">전체 보기</Link>
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
                <Link href="/admin/scores" className={btn}>검토</Link>
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
