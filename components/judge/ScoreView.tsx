'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Match, Team } from '@/lib/contest';
import { autoLabel, calc, CATEGORY_NAMES, DAMAGE_COUNT_ID, damagePtsKey, damageTotal, DQ_COUNTERS, ITEMS, MISSION_NAMES, penaltyCount, penaltyEntries, PRE_CHECKS, reasonKey, REASON_IDS, validate, type Item, type Mission } from '@/lib/judge/rules';
import type { Sheet } from '@/lib/judge/sheets';
import { useContest } from '@/lib/contest';
import { btnGhost, btnPrimary, Card, inputCls } from './ui';

// 공식 점수표(Robotics for Good Youth Challenge 2026–2027 Score sheet V4)를 그대로 옮긴 채점 화면.
// 머리말 → 경기 정보 → 미션 1 → 미션 2 → 일반 벌점 → 합계 순서, 각 표는 행동 / 마크 / 계산 / 점수 4열이다.

const Row = ({ label, children }: { label: ReactNode; children?: ReactNode }) => (
  <div className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-0">
    <div className="min-w-0 flex-1 text-sm">{label}</div>
    {children}
  </div>
);

const Stepper = ({ value, down, up }: { value: number; down: () => void; up: () => void }) => (
  <div className="flex items-center rounded-lg border border-line">
    <button type="button" onClick={down} className="size-[52px] text-2xl" aria-label="감소">−</button>
    <b className="min-w-11 text-center text-2xl">{value}</b>
    <button type="button" onClick={up} className="size-[52px] text-2xl text-accent" aria-label="증가">+</button>
  </div>
);

const Toggle = ({ on, onText, offText, onClick }: { on: boolean; onText: string; offText: string; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className={`h-[52px] w-28 rounded-full text-sm font-bold ${on ? 'bg-accent text-white' : 'border border-line text-gray-600'}`}
  >
    {on ? onText : offText}
  </button>
);

const SECTION: Record<Mission, { band: string; desc: string; note?: (cat: Match['cat']) => string | null }> = {
  M1: { band: 'bg-[#fde3c6]', desc: '경기장의 최종 상태만 확인합니다.' },
  M2: {
    band: 'bg-[#c4dfe2]',
    desc: 'H/PCC에 키트를 배치합니다. 색상별로 올바른 목적지에 분류합니다.',
    note: () => '참고: 노랑은 2 + 2로 남아 있을 때만 보너스를 받습니다. 모두 한 PCC 안에 있으면 오류로 보지 않습니다.',
  },
  PEN: {
    band: 'bg-[#fdcaca]',
    desc: '라운드 중 위반에만 적용합니다. DQ = 실격될 수 있음.',
    note: (cat) => (cat === 'S' ? '시니어 전용 감점은 해당 미션 소계에 이미 포함되어 있습니다.' : null),
  },
};
const SUBTOTAL: Record<Mission, string> = { M1: '미션 1 소계:', M2: '미션 2 소계:', PEN: '일반 벌점 소계:' };

// 4열 표: 행동 / 마크 / 계산 / 점수 (좁은 화면에서는 마크가 아래 줄로 내려간다)
const GRID = 'grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1.5 sm:grid-cols-[minmax(0,1fr)_22rem_6rem_5rem]';

// 공식 양식의 "마크" 칸: 숫자 / NO·YES 칸 중 하나를 칠한다.
function Marks<T extends string | number>({ options, value, onPick, readOnly, danger }: { options: T[]; value: T; onPick?: (o: T) => void; readOnly?: boolean; danger?: boolean }) {
  const dense = options.length > 6;
  return (
    <div className={`flex flex-wrap justify-center ${dense ? 'gap-[3px]' : 'gap-2'}`} role="group">
      {options.map((o) => {
        const on = o === value;
        return (
          <button
            key={String(o)}
            type="button"
            disabled={readOnly}
            aria-pressed={on}
            onClick={() => onPick?.(o)}
            className={`h-11 rounded-md border text-base font-bold tabular-nums ${dense ? 'min-w-7 px-0.5 sm:min-w-[1.75rem]' : 'min-w-12 px-3'} ${
              on ? (danger && o === 'YES' ? 'border-error bg-error text-white' : 'border-black bg-black text-white') : 'border-[#e2e2e2] bg-white text-gray-900'
            } ${readOnly ? 'cursor-default' : ''}`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

const ActionCell = ({ children, muted, bad }: { children: ReactNode; muted?: boolean; bad?: boolean }) => (
  <span className={`flex min-h-11 items-center rounded-md px-3 text-sm ${bad ? 'bg-error/15 text-error' : 'bg-[#e9e9e9]'} ${muted ? 'text-gray-400' : ''}`}>{children}</span>
);
const CalcCell = ({ children }: { children: ReactNode }) => (
  <span className="hidden text-center text-sm font-bold sm:block">{children}</span>
);
const PointsCell = ({ value, text, muted }: { value?: number; text?: string; muted?: boolean }) => (
  <b
    className={`flex min-h-11 items-center justify-end rounded-md bg-[#f3f3f3] px-3 tabular-nums ${
      muted ? 'font-medium text-gray-400' : text ? 'text-error' : value === undefined ? '' : value < 0 ? 'text-error' : value > 0 ? '' : 'text-gray-400'
    }`}
  >
    {text ?? value}
  </b>
);

function InfoBox({ label, value, className = '' }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={`rounded-md bg-[#e9e9e9] px-3 py-2 ${className}`}>
      <p className="text-xs text-gray-600">{label}</p>
      <p className="truncate text-sm font-bold">{value}</p>
    </div>
  );
}

type Props = {
  match: Match;
  team: Team;
  sheet: Sheet;
  edit: (fn: (s: Sheet) => Sheet) => void;
  onBack: () => void;
  backLabel?: string;
  onReview: () => void;
  ruleItems?: Item[];
  judgeName?: string;
};

export default function ScoreView({ match, team, sheet, edit, onBack, backLabel = '← 경기 목록', onReview, ruleItems = ITEMS, judgeName }: Props) {
  const [savedFlash, setSavedFlash] = useState(false);
  const v = sheet.values;
  const c = calc(v, match.cat, ruleItems);
  const errors = validate(v);
  const firstError = errors[0]?.msg;
  const badIds = new Set(errors.flatMap((e) => e.ids));
  const isTournament = !!match.label;

  const setValue = (k: string, val: number | boolean | string) => edit((s) => ({ ...s, values: { ...s.values, [k]: val } }));
  const num = (k: string) => (v[k] === true ? 1 : Number(v[k]) || 0);
  // 일반 벌점 카운터: 횟수를 줄이면 사라진 회차의 사유도 함께 지운다
  const setCounter = (k: string, next: number, max = 9) =>
    edit((s) => {
      const cur = s.values[k] === true ? 1 : Number(s.values[k]) || 0;
      const to = Math.max(0, Math.min(max, next));
      const values = { ...s.values, [k]: to };
      for (let i = to + 1; i <= cur; i++) {
        delete values[reasonKey(k, i)];
        if (k === DAMAGE_COUNT_ID) delete values[damagePtsKey(i)];
      }
      if (k === DAMAGE_COUNT_ID) {
        // 회차별 점수 칸을 항상 만들어 두어 예전 pen_damage 값이 남지 않게 한다
        for (let i = 1; i <= to; i++) if (!(damagePtsKey(i) in values)) values[damagePtsKey(i)] = 0;
        values.pen_damage = to === 0 ? 0 : damageTotal(values);
      }
      return { ...s, values };
    });
  const counter = (k: string, max = 9) => (
    <div className="flex justify-center">
      <Stepper value={num(k)} down={() => setCounter(k, num(k) - 1, max)} up={() => setCounter(k, num(k) + 1, max)} />
    </div>
  );
  // 파손은 회차마다 점수를 따로 적고, 합계를 pen_damage 에 둔다
  const setDamagePts = (i: number, pts: number) =>
    edit((s) => {
      const values = { ...s.values, [damagePtsKey(i)]: Math.min(0, pts) };
      values.pen_damage = damageTotal(values);
      return { ...s, values };
    });
  // 사유는 '규칙 중대 위반'과 '구조물 또는 게임 요소 파손'에만 받는다
  const entries = penaltyEntries(v, ruleItems).filter((e) => REASON_IDS.includes(e.id));
  // 감점 항목 한 줄 + 그 바로 아래 회차별 사유 줄을 한 묶음으로 보여 준다 (사유 줄은 행동·마크 열 너비에 맞춘다)
  const penaltyGroup = (key: string, row: ReactNode, id: string) => {
    const list = entries.filter((e) => e.id === id);
    if (!list.length) return <div key={key}>{row}</div>;
    return (
      <div key={key} className="-mx-1.5 rounded-lg bg-error/5 p-1.5 ring-1 ring-error/20">
        {row}
        <ul className="mt-1.5 space-y-1.5">
          {list.map((e, i) => (
            <li key={e.key} className={GRID}>
              <div className="col-span-2 flex items-center gap-2 sm:col-span-2">
                <span className="w-12 shrink-0 text-center text-sm font-bold tabular-nums text-error">{i + 1}회</span>
                {id === DAMAGE_COUNT_ID && (
                  <input
                    type="number"
                    step={1}
                    max={0}
                    aria-label={`파손 ${i + 1}회 감점`}
                    className={`${inputCls} w-24 shrink-0 text-right`}
                    defaultValue={Number(v[damagePtsKey(i + 1)]) || ''}
                    placeholder="-점수"
                    onChange={(e) => setDamagePts(i + 1, Number(e.target.value) || 0)}
                  />
                )}
                <ReasonInput value={e.reason} onSave={(text) => setValue(e.key, text)} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <main className="mx-auto max-w-5xl pb-28">
      <button type="button" onClick={onBack} className="mb-4 text-sm font-bold">{backLabel}</button>

      <RobotResult teamId={team.id} />

      <Card title="경기 전 확인">
        {PRE_CHECKS.map(([k, label]) => (
          <Row key={k} label={<b className="font-medium">{label}</b>}>
            <Toggle on={!!sheet.pre[k]} onText="확인됨 ✓" offText="확인" onClick={() => edit((s) => ({ ...s, pre: { ...s.pre, [k]: !s.pre[k] } }))} />
          </Row>
        ))}
      </Card>

      {/* 공식 점수표 */}
      <article className="mt-4 rounded-2xl border border-line bg-white p-5 sm:p-7">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold sm:text-2xl">Robotics for Good Youth Challenge 2026–2027</h1>
            <p className="mt-1 text-sm text-gray-500">
              심판용 양식 · <b className="text-gray-700">라운드 종료 시점</b>의 결과만 인정됩니다.
            </p>
            <h2 className="mt-3 text-lg font-extrabold">점수표 — {CATEGORY_NAMES[match.cat]} 부문</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {match.cat === 'J'
                ? '2017년~2013년 출생자. 검체와 분류 대상은 고정 위치에 배치합니다.'
                : '2012년~2009년 출생자. 검체와 분류 대상은 두 경기장에 무작위·대칭으로 배치합니다.'}
            </p>
          </div>
          <img src="/images/ai-for-good.png" alt="AI for Good" className="h-8 shrink-0 sm:h-10" />
        </header>

        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-[6rem_6rem_6rem_1fr_10rem]">
          <InfoBox label="경기" value={isTournament ? match.label : `${match.table}조`} />
          <InfoBox label="테이블" value={isTournament ? (match.field === '좌' ? 'A' : 'B') : match.wave} />
          <InfoBox label="라운드" value={isTournament ? '토너먼트' : `${match.round}차`} />
          <InfoBox label="팀" value={`${team.id} · ${team.name}${team.org ? ` (${team.org})` : ''}`} className="col-span-2 sm:col-span-1" />
          <InfoBox label="심판" value={judgeName ?? '-'} />
        </div>

        {(['M1', 'M2', 'PEN'] as Mission[]).map((g) => {
          const lines = c.lines.filter((l) => l.it.m === g);
          if (!lines.length && g !== 'PEN') return null;
          const sec = SECTION[g];
          const note = sec.note?.(match.cat);
          return (
            <section key={g} className="mt-5">
              <h3 className={`rounded-md px-3 py-1.5 text-base font-extrabold ${sec.band}`}>{MISSION_NAMES[g]}</h3>
              <p className="mt-0.5 text-xs italic">{sec.desc}</p>

              <div className={`${GRID} mt-1 hidden text-center text-sm font-bold sm:grid`}>
                <span className="rounded-md bg-[#cfcfcf] py-1">행동</span>
                <span className="rounded-md bg-[#cfcfcf] py-1">마크</span>
                <span className="rounded-md bg-[#cfcfcf] py-1">계산</span>
                <span className="rounded-md bg-[#cfcfcf] py-1">점수</span>
              </div>

              <div className="mt-1.5 space-y-1.5">
                {lines.map(({ it, p, sub }) => {
                  const max = it.max ?? (it.m === 'PEN' ? 3 : 0);
                  const auto = it.type === 'auto';
                  const row = (
                    <div className={GRID}>
                      <ActionCell muted={auto} bad={badIds.has(it.id)}>{auto ? autoLabel(it.label) : it.label}</ActionCell>
                      <div className={`order-last col-span-2 sm:order-none sm:col-span-1 ${auto ? 'opacity-40' : ''}`}>
                        {g === 'PEN' && it.type === 'count' && counter(it.id, it.max ?? 9)}
                        {g === 'PEN' && it.type === 'manual' && counter(DAMAGE_COUNT_ID)}
                        {g !== 'PEN' && it.type === 'count' && <Marks options={Array.from({ length: max + 1 }, (_, i) => i)} value={num(it.id)} onPick={(n) => setValue(it.id, n)} />}
                        {it.type === 'bool' && <Marks options={['NO', 'YES']} value={v[it.id] ? 'YES' : 'NO'} onPick={(n) => setValue(it.id, n === 'YES')} />}
                        {it.type === 'auto' && <Marks options={['NO', 'YES']} value={sub !== 0 ? 'YES' : 'NO'} readOnly />}
                      </div>
                      <CalcCell>{it.type === 'manual' ? '심판 재량' : it.type === 'count' ? `개수 × ${p}` : `${p > 0 ? '+' : ''}${p}`}</CalcCell>
                      <PointsCell value={sub} muted={auto} />
                    </div>
                  );
                  if (g !== 'PEN') return <div key={it.id}>{row}</div>;
                  return penaltyGroup(it.id, row, it.type === 'manual' ? DAMAGE_COUNT_ID : it.id);
                })}

                {g === 'PEN' &&
                  DQ_COUNTERS.map(({ id, label }) =>
                    penaltyGroup(
                      id,
                      <div className={GRID}>
                        <ActionCell>{label}</ActionCell>
                        <div className="order-last col-span-2 sm:order-none sm:col-span-1">
                          <Marks options={['NO', 'YES']} value={num(id) ? 'YES' : 'NO'} danger onPick={(o) => setCounter(id, o === 'YES' ? 1 : 0, 1)} />
                        </div>
                        <CalcCell>DQ</CalcCell>
                        <PointsCell text={num(id) ? '실격' : ''} />
                      </div>,
                      id,
                    ),
                  )}
              </div>

              <div className="mt-2 grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_11.5rem]">
                <span className="rounded-md bg-[#f3f3f3] px-3 py-2 text-sm font-bold">{SUBTOTAL[g]}</span>
                <b className="rounded-md bg-[#f3f3f3] px-3 py-2 text-right tabular-nums">{c.sum[g]}</b>
              </div>
              {g === 'PEN' && (
                <div className="mt-1.5 grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_11.5rem]">
                  <span className="rounded-md bg-[#f3f3f3] px-3 py-2 text-sm font-bold">패널티 횟수:</span>
                  <b className="rounded-md bg-[#f3f3f3] px-3 py-2 text-right tabular-nums">{penaltyCount(v, ruleItems)}회</b>
                </div>
              )}
              {note && <p className="mt-1 text-xs italic">{note}</p>}
              {g === 'PEN' && entries.length > 0 && <p className="mt-1 text-xs text-gray-500">사유는 입력 후 칸을 벗어나면 저장됩니다.</p>}
            </section>
          );
        })}

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1.3fr_1.4fr]">
          <SumBox label="미션 1" value={c.sum.M1} />
          <SumBox label="미션 2" value={c.sum.M2} />
          <SumBox label="일반 벌점" value={c.sum.PEN} />
          <SumBox label="총점" value={c.dq ? '0 (실격)' : c.total} dark />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div className="rounded-md bg-[#e9e9e9] px-3 py-2 text-sm text-gray-600">심판 서명<p className="text-xs text-gray-400">공동 확인 후 서명 단계에서 받습니다</p></div>
          <div className="rounded-md bg-[#e9e9e9] px-3 py-2 text-sm text-gray-600">팀 확인<p className="text-xs text-gray-400">공동 확인 후 서명 단계에서 받습니다</p></div>
        </div>
      </article>

      <Card title="기록">
        <div className="px-5 py-3">
          <input
            className={`${inputCls} w-full`}
            placeholder="비고 (선택)"
            defaultValue={String(v.note ?? '')}
            onChange={(e) => setValue('note', e.target.value)}
          />
        </div>
      </Card>

      <footer className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-white p-3">
        <div className="mx-auto max-w-5xl">
          {/* 검증 오류는 사라지지 않는 곳에 적어 둔다 ('공동 확인' 버튼이 꺼진 이유) */}
          {firstError && <p role="alert" className="pb-2 text-center text-xs font-semibold text-error">{firstError}</p>}
          <div className="flex items-center gap-3">
            <div className="mr-auto min-w-0 text-sm">
              <span className="text-gray-500">미션1 {c.sum.M1} · 미션2 {c.sum.M2} · 일반 벌점 {c.sum.PEN}</span>
              <b className="ml-2 text-3xl">{c.dq ? '실격' : `${c.total}점`}</b>
            </div>
            {/* 입력은 바로바로 이 기기에 저장되므로 버튼은 확인용이다 */}
            <button
              type="button"
              className={btnGhost}
              onClick={() => {
                setSavedFlash(true);
                setTimeout(() => setSavedFlash(false), 1500);
              }}
            >
              {savedFlash ? '임시저장됨' : '임시저장'}
            </button>
            <button type="button" className={btnPrimary} disabled={errors.length > 0} onClick={onReview}>공동 확인 →</button>
          </div>
        </div>
      </footer>
    </main>
  );
}

// 사유 입력: 타이핑 중에는 화면에만 두고, 칸을 벗어나거나(blur) Enter·화면 이동 시 채점지에 저장한다.
function ReasonInput({ value, onSave }: { value: string; onSave: (text: string) => void }) {
  const [text, setText] = useState(value);
  const [saved, setSaved] = useState(false);
  const latest = useRef({ text, value, onSave });
  latest.current = { text, value, onSave };

  // 입력 중에 화면을 떠나도(언마운트) 마지막 내용을 저장한다
  useEffect(() => () => {
    const { text: t, value: v, onSave: save } = latest.current;
    if (t !== v) save(t);
  }, []);

  const commit = () => {
    if (text === value) return;
    onSave(text);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="relative min-w-0 flex-1">
      <input
        className={`${inputCls} w-full`}
        placeholder="사유"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      {saved && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-accent">저장됨</span>}
    </div>
  );
}

function SumBox({ label, value, dark }: { label: string; value: ReactNode; dark?: boolean }) {
  return (
    <div className={`flex items-center justify-between rounded-md px-3 py-2 font-bold ${dark ? 'bg-[#cfcfcf]' : 'bg-[#e9e9e9]'}`}>
      <span className="text-sm">{label}</span>
      <span className="text-lg font-extrabold tabular-nums">{value}</span>
    </div>
  );
}

// 로봇 검사 결과: 승인된 대수와 승인된 로봇 번호(R1, R2 …). 채점 화면에만 보이고 채점표(PDF)에는 넣지 않는다.
function RobotResult({ teamId }: { teamId: string }) {
  const { config } = useContest();
  const approved = config?.homologationRobots?.[teamId] ?? [];
  const hasResult = !!config?.homologation?.[teamId];
  return (
    <section className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-[#dcdcdc] px-4 py-3" aria-label="로봇 검사 결과">
      {!hasResult ? (
        <span className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-gray-600">로봇 검사 결과 없음</span>
      ) : approved.length === 0 ? (
        <span className="rounded-xl bg-error px-4 py-2 text-sm font-bold text-white">승인된 로봇 없음</span>
      ) : (
        <>
          <span className="rounded-xl bg-[#5b9a3c] px-4 py-2 text-sm font-bold text-white">{approved.length}대 승인 완료</span>
          <span className="h-7 w-px bg-black/40" aria-hidden />
          {approved.map((r) => (
            <span key={r} className="min-w-12 rounded-xl bg-[#5b9a3c] px-3 py-2 text-center text-sm font-bold text-white">{r}</span>
          ))}
        </>
      )}
    </section>
  );
}
