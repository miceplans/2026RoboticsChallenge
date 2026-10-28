'use client';

import { useRealtime, type Standing, type Status } from '@/lib/realtime/useRealtime';

const statusLabel: Record<Status, { text: string; dot: string }> = {
  connecting: { text: '연결 중', dot: 'bg-warning' },
  online: { text: '실시간 연결됨', dot: 'bg-accent' },
  offline: { text: '연결 끊김 · 재연결 중', dot: 'bg-error' },
  denied: { text: '로그인이 필요합니다', dot: 'bg-gray-400' },
};

export function StatusBadge({ status }: { status: Status }) {
  const { text, dot } = statusLabel[status];
  return (
    <span className="inline-flex items-center gap-2 text-sm text-gray-600">
      <span className={`size-2 rounded-full ${dot}`} />
      {text}
    </span>
  );
}

export function StandingsTable({ standings, updatedAt }: { standings: Standing[]; updatedAt: number | null }) {
  if (standings.length === 0) return <p className="mt-4 text-gray-500">아직 집계된 점수가 없습니다.</p>;
  return (
    <>
      <Table standings={standings} />
      {/* 연결이 끊겨 있으면 마지막으로 받은 값이 보이므로 시각을 함께 표시한다 */}
      {updatedAt && <p className="mt-2 text-xs text-gray-500">마지막 수신 {new Date(updatedAt).toLocaleTimeString('ko-KR')}</p>}
    </>
  );
}

function Table({ standings }: { standings: Standing[] }) {
  return (
    <table className="mt-4 w-full max-w-md text-left">
      <thead>
        <tr className="text-white">
          <th className="w-16 rounded-l-2xl bg-accent py-2.5 pl-4 font-semibold">순위</th>
          <th className="bg-accent py-2.5 font-semibold">팀</th>
          <th className="rounded-r-2xl bg-accent py-2.5 pr-4 text-right font-semibold">총점</th>
        </tr>
      </thead>
      <tbody>
        {standings.map((s, i) => (
          <tr key={s.teamId}>
            <td className="py-2.5 pl-4">{i + 1}</td>
            <td className="py-2.5">{s.teamId}</td>
            <td className="py-2.5 pr-4 text-right tabular-nums">{s.total}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function LiveLeaderboard() {
  const { status, standings, standingsAt } = useRealtime();
  return (
    <section>
      <StatusBadge status={status} />
      <StandingsTable standings={standings} updatedAt={standingsAt} />
    </section>
  );
}
