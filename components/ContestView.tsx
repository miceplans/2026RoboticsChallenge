'use client';

import { useState } from 'react';
import RankingBoard from './RankingBoard';
import TournamentBracket from './TournamentBracket';

type View = 'ranking' | 'bracket';
const VIEWS: { id: View; label: string }[] = [
  { id: 'ranking', label: '순위' },
  { id: 'bracket', label: '토너먼트' },
];

export default function ContestView() {
  const [view, setView] = useState<View>('ranking');
  const switcher = (
    <div role="tablist" aria-label="보기 전환" className="inline-flex rounded-full bg-gray-100 p-1">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          role="tab"
          aria-selected={view === v.id}
          onClick={() => setView(v.id)}
          className={`rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${view === v.id ? 'bg-white text-accent shadow-sm' : 'text-gray-500'}`}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
  return view === 'ranking' ? <RankingBoard switcher={switcher} /> : <TournamentBracket switcher={switcher} />;
}
