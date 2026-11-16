'use client';

import { useState } from 'react';
import { useToast } from '@/components/Toast';
import { btnPrimary, Card, Chip, inputCls } from '@/components/judge/ui';
import { teamName, useContest, type TournamentGame, type TournamentRound } from '@/lib/contest';
import { CATEGORY_NAMES, type Category } from '@/lib/judge/rules';

const ROUND_LABEL: Record<TournamentRound, string> = { QF: '8강', SF: '준결승', F: '결승', '3P': '3·4위전' };
const ROUND_ORDER: TournamentRound[] = ['QF', 'SF', 'F', '3P'];
const serverUrl = () => process.env.NEXT_PUBLIC_REALTIME_URL ?? `${location.protocol}//${location.hostname}:4000`;

// 토너먼트 경기 점수 입력: 심판이 두 팀의 점수를 넣어 제출하면, 운영본부(관리자)가 칸별로 확정해 결과로 저장한다.
export default function TournamentScores({ cat }: { cat: Category }) {
  const { config } = useContest();
  const toast = useToast();
  const teams = config?.teams ?? [];
  const submissions = config?.tournament.submissions ?? [];
  const games = (config?.tournament.games ?? [])
    .filter((g) => g.cat === cat && g.teamA && g.teamB && g.status !== 'done')
    .sort((a, b) => ROUND_ORDER.indexOf(a.round) - ROUND_ORDER.indexOf(b.round) || a.gameNo - b.gameNo);

  return (
    <Card title={`${CATEGORY_NAMES[cat]} 토너먼트 경기 점수`}>
      {games.length === 0 ? (
        <p className="p-6 text-center text-sm text-gray-500">점수를 입력할 경기가 없습니다. 8강 팀 배정과 이전 라운드 확정 뒤에 열립니다.</p>
      ) : (
        <div className="divide-y divide-line">
          {games.map((g) => (
            <GameScoreRow key={`${g.round}-${g.gameNo}-${submissions.find((s) => s.cat === cat && s.round === g.round && s.gameNo === g.gameNo)?.ts ?? 0}`} game={g} teams={teams} sub={submissions.find((s) => s.cat === cat && s.round === g.round && s.gameNo === g.gameNo)} onDone={(msg) => toast(msg)} />
          ))}
        </div>
      )}
    </Card>
  );
}

function GameScoreRow({ game, teams, sub, onDone }: { game: TournamentGame; teams: { id: string; name: string }[]; sub?: { scoreA: number; scoreB: number }; onDone: (msg: string) => void }) {
  const [a, setA] = useState(sub ? String(sub.scoreA) : '');
  const [b, setB] = useState(sub ? String(sub.scoreB) : '');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (a === '' || b === '') return onDone('두 팀 점수를 모두 입력해 주세요.');
    setBusy(true);
    try {
      const res = await fetch(`${serverUrl()}/judge/tournament/score`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cat: game.cat, round: game.round, gameNo: game.gameNo, scoreA: Number(a), scoreB: Number(b) }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      onDone(res.ok && data?.ok ? `${ROUND_LABEL[game.round]} ${game.gameNo}경기 점수를 제출했습니다. 운영본부가 확정합니다.` : (data?.error ?? `제출 실패 (${res.status})`));
    } catch {
      onDone('서버에 연결할 수 없습니다.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-3.5 text-sm">
      <b className="w-20 shrink-0">{ROUND_LABEL[game.round]} {game.gameNo}</b>
      <span className="min-w-0 flex-1">
        {teamName(teams as never, game.teamA!)} <span className="text-gray-400">vs</span> {teamName(teams as never, game.teamB!)}
      </span>
      <input type="number" inputMode="numeric" value={a} onChange={(e) => setA(e.target.value)} className={`${inputCls} w-20 text-right tabular-nums`} aria-label="A 팀 점수" />
      <span className="text-gray-400">:</span>
      <input type="number" inputMode="numeric" value={b} onChange={(e) => setB(e.target.value)} className={`${inputCls} w-20 text-right tabular-nums`} aria-label="B 팀 점수" />
      <button type="button" disabled={busy} onClick={submit} className={`${btnPrimary} !px-4 !py-2`}>{sub ? '다시 제출' : '제출'}</button>
      {sub && <Chip tone="info">제출됨 · 확정 대기</Chip>}
    </div>
  );
}
