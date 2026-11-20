'use client';

import { useState, type ReactNode } from 'react';
import type { Match, Team } from '@/lib/judge/data';
import { autoLabel, calc, CATEGORY_NAMES, damagePtsKey, damageWhyKey, ITEMS, inputItems, MISSION_NAMES, PRE_CHECKS, unitPoints, validate, type Mission } from '@/lib/judge/rules';
import type { Sheet } from '@/lib/judge/sheets';
import { useRobotApproval } from '@/lib/judge/robotApproval';
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
  backLabel?: string;
  onReview: () => void;
};

export default function ScoreView({ match, team, sheet, edit, onBack, backLabel = '← 담당 경기 목록', onReview }: Props) {
  const [savedFlash, setSavedFlash] = useState(false);
  const v = sheet.values;
  const c = calc(v, match.cat);
  const errors = validate(v);
  const bad = new Set(errors.flatMap((e) => e.ids));
  const { approval, loading: robotApprovalLoading } = useRobotApproval(team.id);

  const setValue = (k: string, val: number | boolean | string) => edit((s) => ({ ...s, values: { ...s.values, [k]: val } }));
  const bump = (k: string, d: number, max = 99) =>
    edit((s) => ({ ...s, values: { ...s.values, [k]: Math.max(0, Math.min(max, (Number(s.values[k]) || 0) + d)) } }));
  const num = (k: string) => Number(v[k]) || 0;

  return (
    <main className="mx-auto max-w-4xl pb-28">
      <button type="button" onClick={onBack} className="mb-4 text-sm font-bold">{backLabel}</button>

      <header className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-white p-5">
        <Chip tone={match.cat === 'S' ? 'info' : 'neutral'}>{CATEGORY_NAMES[match.cat]}</Chip>
        <b className="text-xl">{team.id} {team.name}</b>
        <span className="text-sm text-gray-500">
          {team.org} · {match.round}차 조별 · 테이블 {match.table} {match.field} · {match.wave}조
        </span>
      </header>

      <Card title="로봇 검차 결과">
        <div className="px-5 py-4">
          {robotApprovalLoading ? (
            <p className="text-sm text-gray-500">승인 결과를 조회하고 있습니다.</p>
          ) : approval && approval.approvedRobotIds.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <b className="text-accent">승인 완료 {approval.approvedRobotIds.length}대</b>
              {approval.approvedRobotIds.map((robot) => <span key={robot} className="rounded-full bg-accent/10 px-3 py-1 font-bold text-accent">{robot}</span>)}
            </div>
          ) : (
            <p className="text-sm text-error">승인된 로봇이 없습니다. 관리자에게 검차 결과를 확인해 주십시오.</p>
          )}
        </div>
      </Card>

      <Card title="경기 전 확인">
        {PRE_CHECKS.map(([k, label]) => (
          <Row key={k} label={<b className="font-medium">{label}</b>}>
            <Toggle on={!!sheet.pre[k]} onText="확인됨 ✓" offText="확인" onClick={() => edit((s) => ({ ...s, pre: { ...s.pre, [k]: !s.pre[k] } }))} />
          </Row>
        ))}
      </Card>

      {(['M1', 'M2', 'PEN'] as Mission[]).map((g) => {
        const inputs = inputItems(match.cat).filter((i) => i.m === g);
        if (!inputs.length) return null;
        // 입력 항목 사이에 자동계산 항목을 채점표 순서대로 끼워 넣는다 (입력 불가, 흐리게 표시)
        const autos = c.lines.filter((l) => l.it.m === g && l.it.type === 'auto');
        const rows = [...inputs, ...autos.map((l) => l.it)].sort((x, y) => ITEMS.indexOf(x) - ITEMS.indexOf(y));
        return (
          <Card key={g} title={MISSION_NAMES[g]}>
            {rows.map((it) => {
              const p = unitPoints(it, match.cat);
              const line = c.lines.find((l) => l.it.id === it.id);
              const sub = line?.sub ?? 0;
              const count = num(it.id);

              if (it.type === 'auto') {
                return (
                  <Row key={it.id} label={<><b className="block font-medium text-gray-400">{autoLabel(it.label)}</b><span className="text-xs text-gray-400">{p > 0 ? '+' : ''}{p}점 · 입력값으로 자동 계산</span></>}>
                    <b className={`w-16 text-right tabular-nums ${sub < 0 ? 'text-error/60' : 'text-gray-400'}`}>{sub > 0 ? '+' : ''}{sub}</b>
                  </Row>
                );
              }

              const hint =
                it.type === 'manual' ? '회마다 감점 점수를 직접 입력'
                : it.type === 'dq' ? '예이면 경기 0점'
                : `${p > 0 ? '+' : ''}${p}점${it.type === 'count' ? ` / 개 · 최대 ${it.max}` : ''}`;
              return (
                <div key={it.id} className={bad.has(it.id) ? 'bg-error/10' : ''}>
                  <Row label={<><b className="block font-medium">{it.label}</b><span className="text-xs text-gray-500">{hint}</span></>}>
                    {(it.type === 'count' || it.type === 'manual') && <Stepper value={count} down={() => bump(it.id, -1)} up={() => bump(it.id, 1, it.max)} />}
                    {it.type === 'bool' && <Toggle on={!!v[it.id]} onText="예" offText="아니오" onClick={() => setValue(it.id, !v[it.id])} />}
                    {it.type === 'dq' && <Toggle danger on={!!v[it.id]} onText="예" offText="아니오" onClick={() => setValue(it.id, !v[it.id])} />}
                    {it.type !== 'dq' && (
                      <b className={`w-16 text-right tabular-nums ${sub < 0 ? 'text-error' : sub > 0 ? '' : 'text-gray-400'}`}>
                        {sub > 0 ? '+' : ''}{sub}
                      </b>
                    )}
                  </Row>
                  {/* 구조물·게임요소 파손: 회마다 점수와 사유를 따로 적는다 */}
                  {it.type === 'manual' &&
                    Array.from({ length: count }, (_, k) => k + 1).map((i) => (
                      <div key={i} className="flex items-center gap-3 px-5 pb-3">
                        <b className="w-8 text-sm text-error">{i}회</b>
                        <input
                          type="number"
                          step={1}
                          className={`${inputCls} w-24 text-right`}
                          placeholder="-점수"
                          defaultValue={v[damagePtsKey(i)] === undefined ? '' : String(v[damagePtsKey(i)])}
                          onChange={(e) => setValue(damagePtsKey(i), e.target.value === '' ? '' : Number(e.target.value))}
                        />
                        <input
                          className={`${inputCls} min-w-0 flex-1`}
                          placeholder="사유"
                          defaultValue={String(v[damageWhyKey(i)] ?? '')}
                          onChange={(e) => setValue(damageWhyKey(i), e.target.value)}
                        />
                      </div>
                    ))}
                  {/* 규칙 중대 위반: 예일 때만 사유 */}
                  {it.type === 'dq' && it.reason && !!v[it.id] && (
                    <div className="px-5 pb-3">
                      <input
                        className={`${inputCls} w-full`}
                        placeholder="사유"
                        defaultValue={String(v[`${it.id}_why`] ?? '')}
                        onChange={(e) => setValue(`${it.id}_why`, e.target.value)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
        );
      })}

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
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <div className="mr-auto min-w-0 text-sm">
            {errors.length > 0 ? (
              <span className="text-error">{errors[0].msg}</span>
            ) : (
              <span className="text-gray-500">미션1 {c.sum.M1} · 미션2 {c.sum.M2} · 일반 벌점 {c.sum.PEN}</span>
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
