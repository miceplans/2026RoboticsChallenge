'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react';
import { fireConfetti } from '@/components/Confetti';
import Score from '@/components/team/Score';
import TeamCell, { Smoke } from '@/components/team/TeamCell';
import TeamName from '@/components/team/TeamName';
import type { TournamentGame } from '@/lib/contest';
import { pos, type Box } from './geometry';
import type { QfPreview, Seeding } from './logic';
import type { BracketTheme } from './theme';

const BOX = 'absolute flex flex-col items-center justify-center gap-0.5 overflow-hidden border bg-white px-2';

// 대진표 박스 공통 틀. out 이면 탈락 연출(회색 + 연기)이 붙는다.
export function BracketBox({ box, className = '', style, out = false, boxRef, children }: { box: Box; className?: string; style?: CSSProperties; out?: boolean; boxRef?: Ref<HTMLDivElement>; children?: ReactNode }) {
  return (
    <div ref={boxRef} style={{ ...pos(box), ...style }} className={`${BOX} ${out ? 'overflow-visible bracket-eliminated' : ''} ${className}`}>
      {out && <Smoke />}
      {children}
    </div>
  );
}

// 1열 왼쪽의 시드 태그 (1위, 8위 …)
export function SeedTag({ box, seed, theme }: { box: Box; seed: number; theme: BracketTheme }) {
  return (
    <div style={{ ...pos(box), backgroundColor: theme.main }} className="absolute flex items-center justify-center text-[1.9cqw] font-extrabold text-white">
      {seed}위
    </div>
  );
}

// 다음 라운드 칸(4강·결승·우승). 미리보기(미확정)나 확정 결과의 승리 팀과 경기 점수를 보여준다.
// out 이면 그 팀이 다음 경기에서 진 것이다. title 이 있으면(우승 칸) 칸 위쪽에 이름표를 단다.
export function Slot({ box, game, preview, out, theme, title }: { box: Box; game?: TournamentGame; preview?: QfPreview; out?: boolean; theme: BracketTheme; title?: string }) {
  // 승자가 "확정"되는 순간(미리보기 아님) 이 칸 안에서만 폭죽이 터진다. 처음 화면을 열 때 이미 확정돼 있던 결과는 터뜨리지 않는다.
  const ref = useRef<HTMLDivElement>(null);
  const confirmedWinner = game?.status === 'done' ? (game.winner ?? undefined) : undefined;
  const prev = useRef<string | undefined | null>(null); // null = 아직 첫 렌더 전
  useEffect(() => {
    if (prev.current !== null && confirmedWinner && confirmedWinner !== prev.current) fireConfetti(ref.current);
    prev.current = confirmedWinner;
  }, [confirmedWinner]);
  const result = preview ?? (game?.status === 'done' && game.winner ? { winner: game.winner, winnerScore: game.winner === game.teamA ? game.scoreA : game.scoreB, loserScore: game.winner === game.teamA ? game.scoreB : game.scoreA } : undefined);
  const style: CSSProperties = title
    ? { borderColor: theme.main, backgroundColor: theme.soft }
    : { borderColor: preview ? theme.main : theme.border, backgroundColor: preview ? theme.tint : '#fff' };
  return (
    <BracketBox box={box} out={out} boxRef={ref} style={style} className={title ? 'justify-start pt-[0.8cqw]' : ''}>
      {title && <span style={{ color: theme.main }} className="text-[1.9cqw] font-extrabold leading-tight">{title}</span>}
      {result && <TeamCell teamId={result.winner} strong sub={<span className="tabular-nums">{result.winnerScore} : {result.loserScore}</span>} />}
    </BracketBox>
  );
}

// 1열 팀 박스 (보기 모드). 3·4위전 칸도 같은 모양을 쓴다.
export function TeamBox({ box, team, eliminated, score, theme }: { box: Box; team?: string; eliminated: boolean; score?: ReactNode; theme: BracketTheme }) {
  return (
    <BracketBox box={box} out={eliminated} style={{ borderColor: theme.border }} className="overflow-visible">
      {team && <TeamCell teamId={team} sub={score} />}
    </BracketBox>
  );
}

// 점선 슬롯 한 칸: 팀을 놓는 곳. 놓인 팀은 다시 끌어 옮기거나 누르면 비워진다.
export function DropSlot({ i, box, team, seeding, score }: { i: number; box: Box; team?: string; seeding: Seeding; score?: number }) {
  const [over, setOver] = useState(false);
  return (
    <div
      style={pos(box)}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        seeding.onDrop(i, e.dataTransfer.getData('text/plain'));
      }}
      onClick={() => (seeding.picked ? seeding.onDrop(i, `team:${seeding.picked}`) : team && seeding.onClear(i))}
      draggable={Boolean(team)}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', `slot:${i}`)}
      title={team ? '누르면 비웁니다' : undefined}
      className={`absolute flex flex-col items-center justify-center gap-0.5 border-2 border-dashed px-2 text-center text-[1.4cqw] font-semibold leading-tight ${
        over ? 'border-accent bg-[#e5f3ff]' : team ? 'cursor-grab border-gray-500 bg-white text-heading' : 'border-gray-300 text-gray-300'
      }`}
    >
      <span className="line-clamp-2 [word-break:keep-all]">{team ? <TeamName id={team} /> : '팀'}</span>
      {team && score !== undefined && <Score value={score} className="text-[1.2cqw] font-normal text-gray-500" />}
    </div>
  );
}
