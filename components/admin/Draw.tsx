'use client';

import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/Toast';
import { teamName, useContest, refreshContest, type Team, type TournamentRound } from '@/lib/contest';
import { CATEGORY_NAMES, type Category } from '@/lib/judge/rules';
import { BracketCanvas } from '@/components/TournamentBracket';
import { GAME_KEYS, SEED_ORDER, useRanking, type QfPreview } from '@/components/bracket/logic';
import Score from '@/components/team/Score';
import TeamName from '@/components/team/TeamName';
import { adminFetch, btn, btnPrimary, card } from './shared';

export default function Draw() {
  const toast = useToast();
  const [cat, setCat] = useState<Category>('S');
  const ranking = useRanking(cat);
  const { config } = useContest();
  const teams = config?.teams ?? [];
  const [slots, setSlots] = useState<(string | undefined)[]>(Array(8).fill(undefined));
  const [applied, setApplied] = useState(false);
  const [custom, setCustom] = useState(false); // false 면 아직 배정을 손대지 않은 빈 상태
  const [editing, setEditing] = useState(false); // 변경 모드: 팀을 끌어서 다시 배치
  const [picked, setPicked] = useState<string>();
  const [localRank, setLocalRank] = useState<string[] | null>(null); // ▲▼ 로 바꾼 표시 순서 (null 이면 서버 순위)
  const loadedCat = useRef<Category | null>(null);
  // 토너먼트 경기 점수는 심판이 입력해 제출한다. 관리자는 칸마다 미리보기를 보고 '확정' 하거나 '변경'(다시 입력받기)한다.
  const [saving, setSaving] = useState<number | null>(null);
  const [tieWinner, setTieWinner] = useState<Record<string, 'A' | 'B'>>({}); // 동점 경기에서 관리자가 고른 승자 (키: 부문-칸)

  // 저장된 배정이 있으면 그대로 불러온다 (탭 진입 시 한 번)
  useEffect(() => {
    if (loadedCat.current === cat || !config) return;
    loadedCat.current = cat;
    const saved = config.tournament.slots.filter((s) => s.cat === cat).sort((a, b) => a.slotNo - b.slotNo);
    if (saved.length === 8 && saved.some((s) => s.teamId)) {
      setSlots(saved.map((s) => s.teamId ?? undefined));
      setApplied(saved.every((s) => s.teamId));
      setCustom(true);
    }
  }, [cat, config]);

  // 서버가 강제하는 잠금: 그 부문 1·2차가 모두 확정돼야 8강을 배정할 수 있다 (progress 가 없는 구버전 응답은 잠그지 않음)
  const prog = config?.progress?.[cat];
  const locked = prog ? !prog.tournamentOpen : false;
  // 저장된 배정이 없으면 빈 칸으로 시작한다. 상위 8팀 시드 배치는 '시드 자동 배치' 버튼으로만 채운다
  const shown = custom ? slots : Array<string | undefined>(8).fill(undefined);
  const placed = new Set(shown.filter(Boolean));
  const count = placed.size;
  const complete = count === Math.min(8, ranking.length) && count > 0;
  const confirmed = applied && !editing;

  // 칸 순서: 8강 승자 4칸 → 준결승 승자 2칸 → 결승 → 3·4위전 (BracketCanvas 의 박스 순서와 같다)
  const gameAt = (k: number) => config?.tournament.games.find((g) => g.cat === cat && g.round === GAME_KEYS[k].round && g.gameNo === GAME_KEYS[k].no);
  const subAt = (k: number) => config?.tournament.submissions?.find((x) => x.cat === cat && x.round === GAME_KEYS[k].round && x.gameNo === GAME_KEYS[k].no);
  const gamePreview: (QfPreview | undefined)[] = GAME_KEYS.map((_, k) => {
    const g = gameAt(k);
    const sub = subAt(k);
    if (!confirmed || !g?.teamA || !g.teamB) return undefined;
    const done = g.status === 'done' && g.scoreA != null && g.scoreB != null;
    const sc = done ? { a: g.scoreA!, b: g.scoreB! } : sub ? { a: sub.scoreA, b: sub.scoreB } : undefined;
    if (!sc) return undefined;
    // 동점이면 관리자가 고른 팀(확정된 경기는 저장된 승자)이 이긴 것으로 본다
    const side = sc.a === sc.b ? (done ? (g.winner === g.teamA ? 'A' : 'B') : tieWinner[`${cat}-${k}`]) : sc.a > sc.b ? 'A' : 'B';
    if (!side) return undefined;
    return { winner: side === 'A' ? g.teamA : g.teamB, loser: side === 'A' ? g.teamB : g.teamA, scoreA: sc.a, scoreB: sc.b };
  });
  // 확정: 심판이 낸 점수(이미 확정된 경기는 저장된 점수)로 결과를 저장한다. 동점이면 고른 승자를 함께 보낸다.
  const confirmGame = async (k: number) => {
    const g = gameAt(k);
    const sub = subAt(k);
    const sc = g?.status === 'done' && g.scoreA != null && g.scoreB != null ? { a: g.scoreA, b: g.scoreB } : sub ? { a: sub.scoreA, b: sub.scoreB } : undefined;
    if (!sc) return;
    setSaving(k);
    try {
      await adminFetch('/admin/tournament/result', { method: 'POST', body: { cat, round: GAME_KEYS[k].round, gameNo: GAME_KEYS[k].no, winner: sc.a === sc.b ? tieWinner[`${cat}-${k}`] : undefined } });
      toast(`${ROUND_LABEL[GAME_KEYS[k].round]} ${GAME_KEYS[k].no}경기 승자를 확정했습니다.`);
      setTieWinner((prev) => { const n = { ...prev }; delete n[`${cat}-${k}`]; return n; });
      refreshContest();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setSaving(null);
    }
  };
  // 각 칸 밑에 붙는 확정/변경 버튼
  const pill = 'rounded-full border px-[0.9cqw] py-[0.25cqw] text-[1.25cqw] font-semibold leading-tight disabled:opacity-40';
  // 동점이면 두 팀 이름 중 올라갈 팀을 고른다
  const tiePicker = (k: number, g: { teamA: string | null; teamB: string | null }, chosen?: 'A' | 'B') => (
    <>
      <span className={`${pill} border-warning bg-white text-warning`}>동점 · 승자</span>
      {(['A', 'B'] as const).map((side) => (
        <button key={side} onClick={() => setTieWinner((prev) => ({ ...prev, [`${cat}-${k}`]: side }))} className={`${pill} max-w-[12cqw] truncate ${chosen === side ? 'border-accent bg-[#eaf5ff] text-[#258eed]' : 'border-line bg-white text-gray-700'}`}>
          {teamName(teams, (side === 'A' ? g.teamA : g.teamB) ?? '')}
        </button>
      ))}
    </>
  );
  const actions = GAME_KEYS.map((_, k) => {
    const g = gameAt(k);
    if (!confirmed || !g?.teamA || !g.teamB) return undefined;
    const picked = tieWinner[`${cat}-${k}`];
    if (g.status === 'done') {
      // 확정된 경기는 심판이 다시 입력하지 않는다. 동점 경기만 어드민이 올라갈 팀을 바꿀 수 있다(변경).
      const savedSide = g.winner === g.teamA ? 'A' : 'B';
      return (
        <>
          <span className={`${pill} border-[#bfe0ff] bg-[#eaf5ff] text-[#258eed]`}>✓ 확정됨</span>
          {g.scoreA === g.scoreB && (
            <>
              {tiePicker(k, g, picked ?? savedSide)}
              <button disabled={saving === k || !picked || picked === savedSide} onClick={() => confirmGame(k)} className={`${pill} border-line bg-white text-gray-700`}>변경</button>
            </>
          )}
        </>
      );
    }
    const sub = subAt(k);
    if (!sub) return <span className={`${pill} border-line bg-white text-gray-400`}>심판 점수 대기</span>;
    const tie = sub.scoreA === sub.scoreB;
    return (
      <>
        {tie && tiePicker(k, g, picked)}
        <button disabled={saving === k || !gamePreview[k]} onClick={() => confirmGame(k)} className={`${pill} border-accent bg-accent text-white`}>확정</button>
      </>
    );
  });

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
    setSlots(fn(shown));
    setCustom(true);
    setApplied(false);
  };
  const switchCat = (c: Category) => {
    setCat(c);
    setSlots(Array(8).fill(undefined));
    setCustom(false);
    setEditing(false);
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

  // 순위 순서 바꾸기: ▲▼ 버튼으로 한 칸씩 옮긴다
  const moveRank = (id: string, dir: -1 | 1) => {
    setLocalRank((prev) => {
      const list = [...(prev ?? baseRankIds)];
      const i = list.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return prev;
      [list[i], list[j]] = [list[j], list[i]];
      return list;
    });
  };

  const saveRankOrder = async () => {
    try {
      await adminFetch('/admin/settings', { method: 'PUT', body: { rankOrder: { [cat]: rankIds } } });
      setLocalRank(null);
      toast('순위 순서를 고정했습니다.');
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
      await adminFetch('/admin/tournament/slots', { method: 'PUT', body: { cat, teamIds: shown.map((s) => s ?? null) } });
      setSlots(shown);
      setCustom(true);
      setApplied(true);
      setEditing(false);
      toast('8강 진출 팀을 확정했습니다. /contest 대진표에 반영됩니다.');
      refreshContest();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <section className={`${card} p-6`}>
      <h1 className="text-3xl font-extrabold text-heading">팀 토너먼트 배정</h1>
      <p className="mt-2 text-sm text-gray-500">1차·2차 중 높은 점수 기준 상위 8팀입니다. 팀을 끌어서 점선 칸에 놓고 저장하면 /contest 대진표에 반영됩니다. (터치: 팀을 누른 뒤 칸을 누르세요)</p>
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
        <p className="mt-4 rounded-xl bg-[#fff4e5] p-3 text-sm font-semibold text-[#b45309]">⚠ 8위 경계에 동점이 있습니다. ▲▼ 버튼으로 진출 팀 순서를 정하고 순서 고정을 누르세요.</p>
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
          <div className="flex items-center justify-between"><h2 className="font-semibold">순위</h2><span className="text-xs text-gray-500">{count}/8 배치</span></div>
          <ol className="mt-3 space-y-2">
            {rankIds.map((id, i) => {
              const r = ranking.find((x) => x.teamId === id);
              if (!r) return null;
              const used = placed.has(id);
              return (
                <li key={id} className="flex items-stretch gap-1">
                  <button
                    type="button"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', `rank:${id}`)}
                    onClick={() => setPicked((p) => (p === id ? undefined : id))}
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded border bg-white px-3 py-2 text-left text-sm ${picked === id ? 'border-accent' : 'border-line'} ${used ? 'opacity-40' : 'hover:border-line-hover'}`}
                  >
                    <span className="w-6 font-bold tabular-nums text-accent">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium"><TeamName id={id} /></span>
                    {tieKeys.has(rankKey(r)) && <span className="text-xs font-bold text-[#b45309]">=</span>}
                    <Score value={r.total} unit="" className="text-gray-500" />
                  </button>
                  <div className="flex flex-col gap-0.5">
                    <button type="button" aria-label="위로" disabled={i === 0} onClick={() => moveRank(id, -1)} className="flex-1 rounded border border-line bg-white px-1.5 text-[10px] leading-none text-gray-600 hover:border-accent hover:text-accent disabled:opacity-30">▲</button>
                    <button type="button" aria-label="아래로" disabled={i === rankIds.length - 1} onClick={() => moveRank(id, 1)} className="flex-1 rounded border border-line bg-white px-1.5 text-[10px] leading-none text-gray-600 hover:border-accent hover:text-accent disabled:opacity-30">▼</button>
                  </div>
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
        </div>
        <div className="min-w-0">
          <div className="overflow-x-auto">
            <BracketCanvas slots={shown} cat={cat} seeding={editing ? { slots: shown, onDrop, onClear, picked } : undefined} preview={gamePreview} actions={actions} />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {confirmed ? (
              <>
                <span className="rounded-2xl bg-[#eaf5ff] px-3 py-2 text-sm font-semibold text-[#258eed]">✓ 8강 진출 팀 확정됨</span>
                <button onClick={() => setEditing(true)} className={btn}>변경</button>
              </>
            ) : (
              <>
                {!editing && <button disabled={locked || !complete} onClick={() => setEditing(true)} className={`${btn} disabled:opacity-40`}>변경</button>}
                <button disabled={!complete || locked} onClick={apply} className={`${btnPrimary} disabled:opacity-40`}>확정</button>
                {!locked && complete && !editing && <span className="text-xs text-gray-500">미리보기입니다. 확정하면 이 팀들로 고정됩니다.</span>}
                {editing && <span className="text-xs text-gray-500">팀을 끌어서 바꾼 뒤 확정을 눌러 주세요.</span>}
                {!complete && !locked && <span className="text-xs text-gray-500">8개 팀을 모두 배치해 주세요</span>}
              </>
            )}
          </div>
          {confirmed && <p className="mt-3 rounded-xl bg-[#eaf5ff] p-3 text-sm text-[#258eed]">8강 대진이 확정됐습니다. /contest 의 대진표 탭에서 확인하세요.</p>}
        </div>
      </div>
      <GameResults cat={cat} />
    </section>
  );
}

// --- 토너먼트 경기 현황 ---
// 점수는 심판 화면에서 입력·제출된다. 여기서는 제출된 점수와 확정 상태를 보여주고, 준결승 이후 팀을 직접 지정할 수 있다.

const ROUND_LABEL: Record<string, string> = { QF: '8강', SF: '준결승', F: '결승', '3P': '3·4위전' };
function GameResults({ cat }: { cat: Category }) {
  const { config } = useContest();
  const toast = useToast();
  const teams = config?.teams ?? [];
  const slots = (config?.tournament.slots ?? []).filter((s) => s.cat === cat).sort((x, y) => x.slotNo - y.slotNo);
  const games = config?.tournament.games ?? [];
  const subs = config?.tournament.submissions ?? [];

  if (slots.length < 8 || !slots.some((s) => s.teamId)) {
    return <p className="mt-8 text-sm text-gray-500">경기 현황은 8개 팀 배정을 확정한 뒤 볼 수 있습니다.</p>;
  }
  // 준결승 이후 수동 배정의 선택지: 해당 부문에 배정된 8강 8팀 전체
  const pickTeams = slots.map((s) => s.teamId).filter((id): id is string => Boolean(id));

  const pickTeam = async (round: TournamentRound, gameNo: number, side: 'A' | 'B', teamId: string | null) => {
    try {
      await adminFetch('/admin/tournament/set-team', { method: 'POST', body: { cat, round, gameNo, side, teamId } });
      toast(`${ROUND_LABEL[round]} ${gameNo}경기 ${side} 팀을 ${teamId ? teamName(teams, teamId) : '빈 칸으로'} 저장했습니다.`);
      refreshContest();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <div className="mt-8">
      <h2 className="font-semibold">경기 현황</h2>
      <p className="mt-1 text-xs text-gray-500">점수는 심판 화면에서 입력해 제출합니다. 제출된 점수는 위 대진표 각 칸에서 미리보기로 보이고, 칸마다 확정하면 결과가 저장됩니다. 준결승·결승·3·4위전은 필요하면 팀을 직접 지정할 수도 있습니다.</p>
      <div className={`${card} mt-3`}>
        {GAME_KEYS.map(({ round, no }) => {
          const g = games.find((x) => x.cat === cat && x.round === round && x.gameNo === no);
          const sub = subs.find((x) => x.cat === cat && x.round === round && x.gameNo === no);
          const done = g?.status === 'done';
          const sel = (side: 'A' | 'B', value: string | null) => (
            <select value={value ?? ''} onChange={(e) => pickTeam(round, no, side, e.target.value || null)} className="max-w-44 rounded-lg border border-line bg-white px-1.5 py-1 text-sm" aria-label={`${ROUND_LABEL[round]} ${no}경기 ${side} 팀`}>
              <option value="">{side}팀 선택</option>
              {pickTeams.map((id) => <option key={id} value={id}>{teamName(teams, id)}</option>)}
            </select>
          );
          return (
            <div key={`${round}-${no}`} className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5 text-sm last:border-0">
              <span className="w-24 shrink-0 text-gray-500">{ROUND_LABEL[round]} {no}</span>
              <span className="min-w-0 flex-1 font-medium">
                {round === 'QF' ? (
                  <>{g?.teamA ? teamName(teams, g.teamA) : '—'} <span className="font-normal text-gray-400">vs</span> {g?.teamB ? teamName(teams, g.teamB) : '—'}</>
                ) : (
                  <span className="flex flex-wrap items-center gap-2">{sel('A', g?.teamA ?? null)}<span className="font-normal text-gray-400">vs</span>{sel('B', g?.teamB ?? null)}</span>
                )}
              </span>
              <span className="tabular-nums text-gray-600">
                {done ? `${g?.scoreA} : ${g?.scoreB}` : sub ? `${sub.scoreA} : ${sub.scoreB}` : '—'}
              </span>
              <span className={`w-28 text-right text-xs ${done ? 'text-[#258eed]' : sub ? 'text-warning' : 'text-gray-400'}`}>{done ? '확정됨' : sub ? '심판 제출 · 확정 대기' : '심판 점수 대기'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
