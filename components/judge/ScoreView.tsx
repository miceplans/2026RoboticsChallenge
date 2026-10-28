'use client';

import { useState, type ReactNode } from 'react';
import type { Match, Team } from '@/lib/judge/data';
import { calc, CATEGORY_NAMES, inputItems, MISSION_NAMES, PRE_CHECKS, unitPoints, validate, type Mission } from '@/lib/judge/rules';
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

type Props = {
  match: Match;
  team: Team;
  sheet: Sheet;
  edit: (fn: (s: Sheet) => Sheet) => void;
  onBack: () => void;
  onReview: () => void;
};

export default function ScoreView({ match, team, sheet, edit, onBack, onReview }: Props) {
  const [savedFlash, setSavedFlash] = useState(false);
  const v = sheet.values;
  const c = calc(v, match.cat);
  const errors = validate(v);

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
        const items = inputItems(match.cat).filter((i) => i.m === g);
        if (!items.length) return null;
        const autos = c.lines.filter((l) => l.it.m === g && l.it.type === 'auto' && l.sub !== 0);
        return (
          <Card key={g} title={MISSION_NAMES[g]}>
            {items.map((it) => {
              const p = unitPoints(it, match.cat);
              const sub = c.lines.find((l) => l.it.id === it.id)?.sub ?? 0;
              const hint =
                it.type === 'manual' ? '감점을 음수로 입력' : `${p > 0 ? '+' : ''}${p}점${it.type === 'count' ? ` / 개 · 최대 ${it.max}` : ''}`;
              return (
                <Row key={it.id} label={<><b className="block font-medium">{it.label}</b><span className="text-xs text-gray-500">{hint}</span></>}>
                  {it.type === 'count' && <Stepper value={num(it.id)} down={() => bump(it.id, -1)} up={() => bump(it.id, 1, it.max)} />}
                  {it.type === 'bool' && <Toggle on={!!v[it.id]} onText="예" offText="아니오" onClick={() => setValue(it.id, !v[it.id])} />}
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
                  <b className={`w-16 text-right tabular-nums ${sub < 0 ? 'text-error' : sub > 0 ? '' : 'text-gray-400'}`}>
                    {sub > 0 ? '+' : ''}{sub}
                  </b>
                </Row>
              );
            })}
            {autos.length > 0 && (
              <p className="px-5 py-3 text-xs text-gray-500">
                자동 계산: {autos.map((l) => `${l.it.label.replace(/ \(.+\)/, '')} ${l.sub > 0 ? '+' : ''}${l.sub}`).join(' · ')}
              </p>
            )}
          </Card>
        );
      })}

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
        <Row label={<><b className="block font-medium">실격</b><span className="text-xs text-gray-500">안전 위험·중대 위반 시 경기 0점</span></>}>
          <Toggle danger on={!!v.dq} onText="실격" offText="해당 없음" onClick={() => setValue('dq', !v.dq)} />
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
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <div className="mr-auto min-w-0 text-sm">
            {errors.length > 0 ? (
              <span className="text-error">{errors[0]}</span>
            ) : (
              <span className="text-gray-500">미션1 {c.sum.M1} · 미션2 {c.sum.M2} · 감점 {c.sum.PEN}</span>
            )}
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
      </footer>
    </main>
  );
}
