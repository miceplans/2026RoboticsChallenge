'use client';

import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/Toast';
import { teamName, useContest, refreshContest, type Team, type TournamentRound } from '@/lib/contest';
import { CATEGORY_NAMES, type Category } from '@/lib/judge/rules';
import { BracketCanvas, SEED_ORDER, useRanking } from '@/components/TournamentBracket';
import { adminFetch, btn, btnPrimary, card } from './shared';
import { TableOrderEditor } from './Ops';

export default function Draw() {
  const toast = useToast();
  const [cat, setCat] = useState<Category>('S');
  const ranking = useRanking(cat);
  const { config } = useContest();
  const teams = config?.teams ?? [];
  const [slots, setSlots] = useState<(string | undefined)[]>(Array(8).fill(undefined));
  const [applied, setApplied] = useState(false);
  const [picked, setPicked] = useState<string>();
  const [localRank, setLocalRank] = useState<string[] | null>(null); // 드래그로 바꾼 표시 순서 (null 이면 서버 순위)
  const [dragRank, setDragRank] = useState<string | null>(null);
  const [overRank, setOverRank] = useState<string | null>(null);
  const loadedCat = useRef<Category | null>(null);

  // 저장된 배정이 있으면 그대로 불러온다 (탭 진입 시 한 번)
  useEffect(() => {
    if (loadedCat.current === cat || !config) return;
    loadedCat.current = cat;
    const saved = config.tournament.slots.filter((s) => s.cat === cat).sort((a, b) => a.slotNo - b.slotNo);
    if (saved.length === 8) {
      setSlots(saved.map((s) => s.teamId ?? undefined));
      setApplied(saved.every((s) => s.teamId));
    }
  }, [cat, config]);

  const placed = new Set(slots.filter(Boolean));
  const count = placed.size;
  const complete = count === Math.min(8, ranking.length) && count > 0;
  // 서버가 강제하는 잠금: 그 부문 1·2차가 모두 확정돼야 8강을 배정할 수 있다 (progress 가 없는 구버전 응답은 잠그지 않음)
  const prog = config?.progress?.[cat];
  const locked = prog ? !prog.tournamentOpen : false;

  // 동점 = 최고점·합계·감점이 전부 같음. useRanking 은 rankOrder 반영 순서라 그대로 그룹을 계산한다.
  const rankKey = (r: { total: number; sum?: number; pen?: number }) => `${r.total}|${r.sum}|${r.pen}`;
  const tieKeys = new Set<string>();
  for (const r of ranking) {
    const k = rankKey(r);
    if (ranking.some((o) => o !== r && rankKey(o) === k)) tieKeys.add(k);
  }
  let tieAtCut = false; // 동점 그룹이 8위 경계를 걸치면 진출 팀을 수동으로 정해야 한다
  for (let i = 0; i < ranking.length; i++) {
    if (i > 0 && rankKey(ranking[i]) === rankKey(ranking[i - 1])) continue;
    let j = i + 1;
    while (j < ranking.length && rankKey(ranking[j]) === rankKey(ranking[i])) j++;
    if (i + 1 <= 8 && j > 8) tieAtCut = true;
  }

  const baseRankIds = ranking.map((r) => r.teamId);
  const rankIds = localRank ?? baseRankIds;
  const rankDirty = localRank !== null && localRank.join('|') !== baseRankIds.join('|');
  const hasOverride = Boolean(config?.settings.rankOrder?.[cat]?.length);

  const change = (fn: (prev: (string | undefined)[]) => (string | undefined)[]) => {
    setSlots(fn);
    setApplied(false);
  };
  const switchCat = (c: Category) => {
    setCat(c);
    setSlots(Array(8).fill(undefined));
    setPicked(undefined);
    setApplied(false);
    setLocalRank(null);
  };
  const onDrop = (slot: number, payload: string) => {
    const [kind, val] = payload.split(':');
    change((prev) => {
      const next = [...prev];
      if (kind === 'slot') {
        const from = Number(val);
        [next[from], next[slot]] = [next[slot], next[from]]; // 칸끼리는 자리 교환
      } else if (kind === 'team' || kind === 'rank') {
        // 순위 패널에서 온 드래그(rank:)도 팀 배치와 같이 처리한다
        const old = next.indexOf(val);
        if (old >= 0) next[old] = undefined;
        next[slot] = val;
      }
      return next;
    });
    setPicked(undefined);
  };
  const onClear = (slot: number) => change((prev) => prev.map((t, i) => (i === slot ? undefined : t)));
  const autoFill = () => !locked && change(() => SEED_ORDER.map((seed) => ranking[seed - 1]?.teamId));

  // 순위 패널끼리의 드래그: rank:팀ID 페이로드만 받아 슬롯 드래그(team:/slot:)와 섞이지 않게 한다
  const onRankDrop = (target: string, payload: string) => {
    if (!payload.startsWith('rank:')) return;
    const from = payload.slice(5);
    if (from === target) return;
    setLocalRank((prev) => {
      const list = [...(prev ?? baseRankIds)];
      const fi = list.indexOf(from);
      const ti = list.indexOf(target);
      if (fi < 0 || ti < 0) return prev;
      list.splice(fi, 1);
      list.splice(ti, 0, from);
      return list;
    });
  };

  const saveRankOrder = async () => {
    try {
      await adminFetch('/admin/settings', { method: 'PUT', body: { rankOrder: { [cat]: rankIds } } });
      setLocalRank(null);
      toast('합산 순위 순서를 고정했습니다.');
      refreshContest();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const resetRankOrder = async () => {
    try {
      await adminFetch('/admin/settings', { method: 'PUT', body: { rankOrder: {} } });
      setLocalRank(null);
      toast('자동 계산 순위로 되돌렸습니다.');
      refreshContest();
    } catch (e) {
      toast((e as Error).message);
    }
  };

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
      <p className="mt-2 text-sm text-gray-500">1차·2차 점수를 합산한 상위 8팀입니다. 팀을 끌어서 점선 칸에 놓고 저장하면 /contest 대진표에 반영됩니다. (터치: 팀을 누른 뒤 칸을 누르세요)</p>
      <nav className="mt-4 flex gap-2 border-b border-line">
        {(['S', 'J'] as Category[]).map((c) => (
          <button key={c} onClick={() => switchCat(c)} className={`px-4 py-2 text-sm font-bold ${cat === c ? 'border-b-2 border-accent text-accent' : 'text-gray-500'}`}>{CATEGORY_NAMES[c]}</button>
        ))}
      </nav>
      {locked && prog && (
        <p className="mt-4 rounded-xl bg-[#fff4e5] p-3 text-sm font-semibold text-[#b45309]">
          🔒 예선이 끝나야 8강을 배정할 수 있습니다. 1차 확정 {prog.r1.confirmed}/{prog.r1.total} · 2차 확정 {prog.r2.confirmed}/{prog.r2.total}경기 (점수 탭에서 대기 중인 점수를 확정하세요)
        </p>
      )}
      {tieAtCut && (
        <p className="mt-4 rounded-xl bg-[#fff4e5] p-3 text-sm font-semibold text-[#b45309]">⚠ 8위 경계에 동점이 있습니다. 드래그로 진출 팀을 결정하고 순서 고정을 누르세요.</p>
      )}
      <div className="mt-6 grid gap-6 xl:grid-cols-[260px_1fr]">
        <div
          className="rounded bg-[#e5f3ff] p-4"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const [kind, val] = e.dataTransfer.getData('text/plain').split(':');
            if (kind === 'slot') onClear(Number(val));
          }}
        >
          <div className="flex items-center justify-between"><h2 className="font-semibold">합산 순위</h2><span className="text-xs text-gray-500">{count}/8 배치</span></div>
          <ol className="mt-3 space-y-2">
            {rankIds.map((id, i) => {
              const r = ranking.find((x) => x.teamId === id);
              if (!r) return null;
              const used = placed.has(id);
              return (
                <li key={id}>
                  <button
                    type="button"
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData('text/plain', `rank:${id}`); setDragRank(id); }}
                    onDragEnd={() => { setDragRank(null); setOverRank(null); }}
                    onDragOver={(e) => { e.preventDefault(); setOverRank(id); }}
                    onDragLeave={() => setOverRank((o) => (o === id ? null : o))}
                    onDrop={(e) => { e.preventDefault(); onRankDrop(id, e.dataTransfer.getData('text/plain')); setOverRank(null); setDragRank(null); }}
                    onClick={() => setPicked((p) => (p === id ? undefined : id))}
                    className={`flex w-full items-center gap-2 rounded border bg-white px-3 py-2 text-left text-sm ${overRank === id && dragRank !== id ? 'border-accent' : picked === id ? 'border-accent' : 'border-line'} ${used ? 'opacity-40' : 'cursor-grab hover:border-line-hover'}`}
                  >
                    <span className="w-6 font-bold tabular-nums text-accent">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{teamName(teams, id)}</span>
                    {tieKeys.has(rankKey(r)) && <span className="text-xs font-bold text-[#b45309]">=</span>}
                    <span className="tabular-nums text-gray-500">{r.total}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={autoFill} disabled={locked} className={`${btn} disabled:opacity-40`}>시드 자동 배치</button>
            <button onClick={() => change(() => Array(8).fill(undefined))} className={btn}>초기화</button>
          </div>
          {(rankDirty || hasOverride) && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-[#b9d9f6] pt-3">
              {rankDirty && <button onClick={saveRankOrder} className={btnPrimary}>이 순서로 고정</button>}
              <button onClick={resetRankOrder} className={btn}>자동 순위로 되돌리기</button>
            </div>
          )}
          <div className="mt-5 border-t border-[#b9d9f6] pt-4"><TableOrderEditor /></div>
        </div>
        <div className="min-w-0">
          <div className="overflow-x-auto">
            <BracketCanvas slots={slots} cat={cat} seeding={{ slots, onDrop, onClear, picked }} />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button disabled={!complete || locked} onClick={apply} className={`${btnPrimary} disabled:opacity-40`}>{applied ? '저장 완료 · 적용됨' : '토너먼트 저장 · 적용'}</button>
            {!complete && <span className="text-xs text-gray-500">8개 팀을 모두 배치해 주세요</span>}
          </div>
          {applied && <p className="mt-3 rounded-xl bg-[#eaf5ff] p-3 text-sm text-[#258eed]">토너먼트 대진이 저장됐습니다. /contest 의 대진표 탭에서 확인하세요.</p>}
        </div>
      </div>
      <GameResults cat={cat} />
    </section>
  );
}

// --- 토너먼트 경기 결과 입력 ---

const ROUND_LABEL: Record<string, string> = { QF: '8강', SF: '준결승', F: '결승', '3P': '3·4위전' };

function GameRow({ cat, round, gameNo, teamA, teamB, scoreA, scoreB, teams, pickTeams }: {
  cat: Category;
  round: TournamentRound;
  gameNo: number;
  teamA: string | null;
  teamB: string | null;
  scoreA: number | null;
  scoreB: number | null;
  teams: Team[];
  pickTeams?: string[]; // 준결승 이후: 빈 칸 + 해당 부문 8강 배정 8팀으로 A/B 팀을 고른다 (QF 는 슬롯 배정이 정함)
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

  // 4강 슬롯 팀 수동 배정: 자동 진출 대신 직접 고르거나 빈 칸으로 둔다 (기권·부전승 등)
  const pickTeam = async (side: 'A' | 'B', teamId: string | null) => {
    try {
      await adminFetch('/admin/tournament/set-team', { method: 'POST', body: { cat, round, gameNo, side, teamId } });
      toast(`${ROUND_LABEL[round]} ${gameNo}경기 ${side} 팀을 ${teamId ? teamName(teams, teamId) : '빈 칸으로'} 저장했습니다.`);
      refreshContest();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const teamSelect = (side: 'A' | 'B', value: string | null) => (
    <select
      value={value ?? ''}
      onChange={(e) => pickTeam(side, e.target.value || null)}
      className="max-w-44 rounded-lg border border-line bg-white px-1.5 py-1 text-sm"
      aria-label={`${ROUND_LABEL[round]} ${gameNo}경기 ${side} 팀`}
    >
      <option value="">{side}팀 선택</option>
      {(pickTeams ?? []).map((id) => (
        <option key={id} value={id}>{teamName(teams, id)}</option>
      ))}
    </select>
  );

  const inputCls2 = 'w-20 rounded-lg border border-line bg-white px-2 py-1 text-right tabular-nums disabled:opacity-40';
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5 text-sm last:border-0">
      <span className="w-24 shrink-0 text-gray-500">{ROUND_LABEL[round]} {gameNo}</span>
      <span className="min-w-0 flex-1 font-medium">
        {pickTeams ? (
          <span className="flex flex-wrap items-center gap-2">
            {teamSelect('A', teamA)}
            <span className="font-normal text-gray-400">vs</span>
            {teamSelect('B', teamB)}
          </span>
        ) : (
          <>{teamA ? teamName(teams, teamA) : '—'} <span className="font-normal text-gray-400">vs</span> {teamB ? teamName(teams, teamB) : '—'}</>
        )}
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
  const gameOf = (round: TournamentRound, gameNo: number) => games.find((g) => g.cat === cat && g.round === round && g.gameNo === gameNo);

  if (slots.length < 8) {
    return <p className="mt-8 text-sm text-gray-500">경기 결과 입력은 8개 팀 배정을 저장한 뒤 할 수 있습니다.</p>;
  }

  // 준결승 이후 수동 배정의 선택지: 해당 부문에 배정된 8강 8팀 전체
  const pickTeams = slots.slice(0, 8).map((s) => s.teamId).filter((id): id is string => Boolean(id));

  const rows: { key: string; round: TournamentRound; gameNo: number; teamA: string | null; teamB: string | null; scoreA: number | null; scoreB: number | null; updatedAt: number }[] = [];
  for (let j = 1; j <= 4; j++) {
    const g = gameOf('QF', j);
    rows.push({ key: `QF-${j}`, round: 'QF', gameNo: j, teamA: slots[2 * j - 2]?.teamId ?? null, teamB: slots[2 * j - 1]?.teamId ?? null, scoreA: g?.scoreA ?? null, scoreB: g?.scoreB ?? null, updatedAt: g?.updatedAt ?? 0 });
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
      <p className="mt-1 text-xs text-gray-500">승자가 다음 라운드로 진출하고, 준결승 패자는 3·4위전으로 갑니다. 저장한 결과를 고치면 하위 라운드도 다시 계산됩니다. 준결승·결승·3·4위전은 자동 진출 대신 아래에서 팀을 직접 지정할 수도 있습니다.</p>
      <div className={`${card} mt-3`}>
        {rows.map((r) => (
          <GameRow key={`${r.key}-${r.updatedAt}`} cat={cat} round={r.round} gameNo={r.gameNo} teamA={r.teamA} teamB={r.teamB} scoreA={r.scoreA} scoreB={r.scoreB} teams={teams} pickTeams={r.round === 'QF' ? undefined : pickTeams} />
        ))}
      </div>
    </div>
  );
}
