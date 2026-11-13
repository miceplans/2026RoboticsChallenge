'use client';

import { useState, type ReactNode } from 'react';
import type { Match, Team } from '@/lib/contest';
import { calc, CATEGORY_NAMES, ITEMS, MISSION_NAMES, PRE_CHECKS, validate, type Item, type Mission } from '@/lib/judge/rules';
import type { Sheet } from '@/lib/judge/sheets';
import { btnGhost, btnPrimary, Card, Chip, inputCls } from './ui';

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

const Toggle = ({ on, onText, offText, onClick, danger }: { on: boolean; onText: string; offText: string; onClick: () => void; danger?: boolean }) => (
  <button
    type="button"
    onClick={onClick}
    className={`h-[52px] w-28 rounded-full text-sm font-bold ${on ? (danger ? 'bg-error text-white' : 'bg-accent text-white') : 'border border-line text-gray-600'}`}
  >
    {on ? onText : offText}
  </button>
);

const MISSION_HEAD: Record<Mission, string> = { M1: 'bg-orange-100', M2: 'bg-sky-100', PEN: 'bg-red-100' };

// PDF 심판표의 "마크" 칸처럼 숫자 / NO·YES 버튼을 한 줄로 늘어놓는다.
function Marks<T extends string | number>({ options, value, onPick, readOnly, danger }: { options: T[]; value: T; onPick?: (o: T) => void; readOnly?: boolean; danger?: boolean }) {
  return (
    <div className="flex gap-1.5" role="group">
      {options.map((o) => {
        const on = o === value;
        return (
          <button
            key={String(o)}
            type="button"
            disabled={readOnly}
            aria-pressed={on}
            onClick={() => onPick?.(o)}
            className={`h-11 min-w-11 rounded-lg border px-3 text-base font-bold ${
              on ? (danger && o === 'YES' ? 'border-error bg-error text-white' : 'border-accent bg-accent text-white') : 'border-line bg-white text-gray-700'
            } ${readOnly ? 'opacity-70' : ''}`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

type Props = {
  match: Match;
  team: Team;
  sheet: Sheet;
  edit: (fn: (s: Sheet) => Sheet) => void;
  onBack: () => void;
  onReview: () => void;
  ruleItems?: Item[];
};

export default function ScoreView({ match, team, sheet, edit, onBack, onReview, ruleItems = ITEMS }: Props) {
  const [savedFlash, setSavedFlash] = useState(false);
  const v = sheet.values;
  const c = calc(v, match.cat, ruleItems);
  const errors = validate(v);
  const firstError = errors[0];

  const setValue = (k: string, val: number | boolean | string) => edit((s) => ({ ...s, values: { ...s.values, [k]: val } }));
  const bump = (k: string, d: number, max = 99) =>
    edit((s) => ({ ...s, values: { ...s.values, [k]: Math.max(0, Math.min(max, (Number(s.values[k]) || 0) + d)) } }));
  const num = (k: string) => Number(v[k]) || 0;

  return (
    <main className="mx-auto max-w-4xl pb-28">
      <button type="button" onClick={onBack} className="mb-4 text-sm font-bold">← 담당 경기 목록</button>

      <header className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-white p-5">
        <Chip tone={match.cat === 'S' ? 'info' : 'neutral'}>{CATEGORY_NAMES[match.cat]}</Chip>
        <b className="text-xl">{team.id} {team.name}</b>
        <span className="text-sm text-gray-500">
          {team.org} · {match.round}차 조별 · 테이블 {match.table} {match.field} · {match.wave}조
        </span>
      </header>

      <Card title="경기 전 확인">
        {PRE_CHECKS.map(([k, label]) => (
          <Row key={k} label={<b className="font-medium">{label}</b>}>
            <Toggle on={!!sheet.pre[k]} onText="확인됨 ✓" offText="확인" onClick={() => edit((s) => ({ ...s, pre: { ...s.pre, [k]: !s.pre[k] } }))} />
          </Row>
        ))}
      </Card>

      {(['M1', 'M2', 'PEN'] as Mission[]).map((g) => {
        const lines = c.lines.filter((l) => l.it.m === g);
        if (!lines.length) return null;
        const head = MISSION_HEAD[g];
        return (
          <section key={g} className="mt-4 overflow-hidden rounded-2xl border border-line bg-white">
            <h2 className={`px-5 py-3 text-base font-bold ${head}`}>{MISSION_NAMES[g]}</h2>
            <div className="hidden grid-cols-[1fr_auto_5rem_4rem] gap-3 bg-gray-200 px-4 py-1.5 text-center text-xs font-bold text-gray-700 sm:grid">
              <span>행동</span><span>마크</span><span>계산</span><span>점수</span>
            </div>
            {lines.map(({ it, p, sub }) => {
              const max = it.m === 'PEN' ? 3 : it.max ?? 0;
              return (
                <div key={it.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 border-b border-line px-4 py-2.5 last:border-0 sm:grid-cols-[1fr_auto_5rem_4rem]">
                  <span className="text-sm">{it.label.replace(/ ?\((보너스·)?자동\)| ?\(보너스·자동\)/, '')}</span>
                  <div className="order-last col-span-2 flex justify-center sm:order-none sm:col-span-1">
                    {it.type === 'count' && <Marks options={Array.from({ length: max + 1 }, (_, i) => i)} value={num(it.id)} onPick={(n) => setValue(it.id, n)} />}
                    {it.type === 'bool' && <Marks options={['NO', 'YES']} value={v[it.id] ? 'YES' : 'NO'} onPick={(n) => setValue(it.id, n === 'YES')} />}
                    {it.type === 'auto' && <Marks options={['NO', 'YES']} value={sub !== 0 ? 'YES' : 'NO'} readOnly />}
                    {it.type === 'manual' && (
                      <input
                        type="number"
                        step={1}
                        max={0}
                        className={`${inputCls} w-28 text-right`}
                        defaultValue={num(it.id)}
                        onChange={(e) => setValue(it.id, Number(e.target.value) || 0)}
                      />
                    )}
                  </div>
                  <span className="hidden text-center text-xs font-bold text-gray-600 sm:block">
                    {it.type === 'manual' ? '심판 재량' : it.type === 'count' ? `개수 × ${p}` : `${p > 0 ? '+' : ''}${p}`}
                  </span>
                  <b className={`w-14 text-right tabular-nums ${sub < 0 ? 'text-error' : sub > 0 ? '' : 'text-gray-400'}`}>
                    {sub > 0 ? '+' : ''}{sub}
                  </b>
                </div>
              );
            })}
            <p className="bg-gray-100 px-5 py-2 text-sm font-bold">소계: {c.sum[g]}점</p>
          </section>
        );
      })}

      <Card title="실격 (DQ)">
        <Row label={<b className="font-medium">관중·참가자에게 위험을 줌</b>}>
          <Marks options={['NO', 'YES']} value={v.dq_danger ? 'YES' : 'NO'} danger onPick={(n) => setValue('dq_danger', n === 'YES')} />
        </Row>
        <Row label={<b className="font-medium">규칙 중대 위반</b>}>
          <Marks options={['NO', 'YES']} value={v.dq_breach ? 'YES' : 'NO'} danger onPick={(n) => setValue('dq_breach', n === 'YES')} />
        </Row>
      </Card>

      <Card title="기록">
        <Row label={<><b className="block font-medium">리셋 요청 횟수</b><span className="text-xs text-gray-500">타이머는 재시작하지 않음</span></>}>
          <Stepper value={num('resets')} down={() => bump('resets', -1)} up={() => bump('resets', 1, 9)} />
        </Row>
        <Row label={<><b className="block font-medium">종료 시각(초)</b><span className="text-xs text-gray-500">조기 종료 선언 시, 미선언은 120</span></>}>
          <input
            type="number"
            min={0}
            max={120}
            placeholder="120"
            className={`${inputCls} w-28 text-right`}
            defaultValue={v.endTime === undefined ? '' : String(v.endTime)}
            onChange={(e) => setValue('endTime', e.target.value === '' ? '' : Number(e.target.value))}
          />
        </Row>
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
        <div className="mx-auto max-w-4xl">
          {/* 검증 오류는 사라지지 않는 곳에 적어 둔다 ('공동 확인' 버튼이 꺼진 이유) */}
          {firstError && <p role="alert" className="pb-2 text-center text-xs font-semibold text-error">{firstError}</p>}
          <div className="flex items-center gap-3">
            <div className="mr-auto min-w-0 text-sm">
              <span className="text-gray-500">미션1 {c.sum.M1} · 미션2 {c.sum.M2} · 감점 {c.sum.PEN}</span>
              <b className="ml-2 text-3xl">{c.total}점</b>
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
