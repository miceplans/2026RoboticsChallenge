'use client';

import { forwardRef, type ReactNode } from 'react';
import type { Match, Team } from '@/lib/contest';
import { calc, DAMAGE_COUNT_ID, damageTotal, penaltyCount, unitPoints, type Category, type Item } from '@/lib/judge/rules';
import type { Sheet } from '@/lib/judge/sheets';

// 공식 점수표(Robotics for Good Youth Challenge 2026–2027 Score sheet V4)의 항목·배치를 한국어로 옮긴 PDF 양식.
// 행 구성은 공식 양식에 고정되어 있고, 마크·점수는 채점 입력값(calc 결과)에서 채운다.

type Props = {
  judgeId: string;
  judgeName: string;
  match: Match;
  team: Team;
  sheet: Sheet;
  ruleItems: Item[];
  mode?: 'capture' | 'inline';
};

// count: 숫자 마크 / yn: NO·YES 마크 / counter: 횟수(일반 벌점) / damage: 횟수 + 심판 재량 감점 / dq: 실격 횟수
type RowSpec = { label: string; ids: string[]; kind: 'count' | 'yn' | 'counter' | 'damage' | 'dq'; marks?: number; calcText?: string };

const M1_ROWS = (cat: Category): RowSpec[] => [
  { label: '실험실 슬롯 안에 있는 검체', ids: ['s_slot'], kind: 'count', marks: 3 },
  { label: '보너스: 실험실 안 검체 3개', ids: ['b_samples'], kind: 'yn' },
  ...(cat === 'S'
    ? ([
        { label: '격리구역·실험실 밖에 있는 검체', ids: ['s_out'], kind: 'count', marks: 3 },
        { label: '격리구역에 있는 검체', ids: ['s_quar'], kind: 'count', marks: 3 },
      ] satisfies RowSpec[])
    : []),
  { label: '올바른 위치에 똑바로, 안정적으로 서 있는 빔', ids: ['beam'], kind: 'count', marks: 2 },
  { label: '보너스: 격리 경계 완성', ids: ['closed'], kind: 'yn' },
];

const M2_ROWS = (cat: Category): RowSpec[] => [
  { label: 'H 또는 PCC 안의 의료키트', ids: ['kit'], kind: 'count', marks: 10 },
  { label: '보너스: 배분 6 H + 2 PCC + 2 PCC', ids: ['b_kits'], kind: 'yn' },
  ...(cat === 'S' ? ([{ label: '키트가 하나도 없는 H/PCC 구역', ids: ['p_kitzone'], kind: 'count', marks: 3 }] satisfies RowSpec[]) : []),
  { label: 'H 안의 빨강 실린더', ids: ['red_h'], kind: 'count', marks: 4 },
  { label: '보너스: H 안 빨강 실린더 4개', ids: ['b_red'], kind: 'yn' },
  { label: 'PCC 안의 노란 실린더', ids: ['yel'], kind: 'count', marks: 4 },
  { label: '보너스: 노란 실린더 2 + 2 분배', ids: ['b_yel'], kind: 'yn' },
  { label: 'RZ 구역 안의 초록 실린더', ids: ['grn'], kind: 'count', marks: 4 },
  { label: '보너스: RZ 안 초록 실린더 4개', ids: ['b_grn'], kind: 'yn' },
  ...(cat === 'S'
    ? ([
        { label: 'H 밖의 빨강 실린더', ids: ['red_out'], kind: 'count', marks: 4 },
        { label: 'PCC 밖의 노랑 실린더', ids: ['yel_out'], kind: 'count', marks: 4 },
        { label: 'RZ 밖의 초록 실린더', ids: ['grn_out'], kind: 'count', marks: 4 },
      ] satisfies RowSpec[])
    : []),
];

const PEN_ROWS: RowSpec[] = [
  { label: '라운드 중 로봇 터치', ids: ['pen_touch'], kind: 'counter' },
  { label: '경기장 또는 부품 조작', ids: ['pen_field'], kind: 'counter' },
  { label: '프로그램 재시작 또는 수정', ids: ['pen_restart'], kind: 'counter' },
  { label: '로봇이 경기장 밖으로 완전히 이탈', ids: ['pen_out'], kind: 'counter' },
  { label: '구조물 또는 부품 파손', ids: ['pen_damage'], kind: 'damage', calcText: '심판 재량' },
  { label: '관중 또는 참가자에게 위험', ids: ['dq_danger'], kind: 'dq', calcText: 'DQ' },
  { label: '중대한 규칙 위반', ids: ['dq_breach'], kind: 'dq', calcText: 'DQ' },
];

const C = {
  cell: '#e9e9e9',
  head: '#cfcfcf',
  points: '#f3f3f3',
  m1: '#fde3c6',
  m2: '#c4dfe2',
  pen: '#fdcaca',
};

const GRID = { display: 'grid', gridTemplateColumns: '1fr 262px 92px 88px', columnGap: 6 } as const;

export const ScoreSheetPdf = forwardRef<HTMLDivElement, Props>(function ScoreSheetPdf(
  { judgeName, match, team, sheet, ruleItems, mode = 'capture' },
  ref,
) {
  const cat = match.cat;
  const values = sheet.values;
  const score = calc(values, cat, ruleItems);
  const lineOf = (id: string) => score.lines.find((l) => l.it.id === id);
  const itemOf = (id: string) => ruleItems.find((it) => it.id === id);

  const resolve = (row: RowSpec) => {
    const times = (id: string) => (values[id] === true ? 1 : Number(values[id]) || 0);
    if (row.kind === 'dq') {
      const cnt = times(row.ids[0]);
      return { qty: cnt, points: cnt ? '실격' : '', calcText: row.calcText! };
    }
    if (row.kind === 'damage') {
      const pts = damageTotal(values);
      return { qty: times(DAMAGE_COUNT_ID) || (pts !== 0 ? 1 : 0), points: String(pts), calcText: row.calcText! };
    }
    const qty = row.ids.reduce((s, id) => s + (lineOf(id)?.q ?? (Number(values[id]) || 0)), 0);
    const pts = row.ids.reduce((s, id) => s + (lineOf(id)?.sub ?? 0), 0);
    const it = itemOf(row.ids[0]);
    const unit = it ? unitPoints(it, cat) : 0;
    const calcText = row.kind === 'count' || row.kind === 'counter' ? `num x ${unit}` : `${unit > 0 ? '+' : ''}${unit}`;
    return { qty, points: String(pts), calcText };
  };

  const fmtDate = (t?: number) => (t ? new Date(t).toLocaleString('ko-KR') : '');
  const isTournament = !!match.label;

  return (
    <div
      aria-hidden={mode === 'capture'}
      className={mode === 'capture' ? 'pointer-events-none fixed left-[-10000px] top-0' : 'score-sheet-inline'}
    >
      <div
        ref={ref}
        className="bg-white text-black"
        style={{ width: 794, minHeight: 1123, padding: '40px 44px 36px', fontSize: 12.5, lineHeight: 1.35 }}
      >
        {/* 머리말 */}
        <div className="flex items-start justify-between">
          <div>
            {cat === 'J' && (
              <>
                <h1 className="font-extrabold" style={{ fontSize: 21, marginTop: 14 }}>Robotics for Good Youth Challenge 2026–2027</h1>
                <p className="mt-1 text-[#6b6b6b]">
                  심판용 출력 양식 · <b className="text-[#4a4a4a]">라운드 종료 시점</b>의 결과만 인정됩니다.
                </p>
              </>
            )}
            <h2 className="font-extrabold" style={{ fontSize: 16, marginTop: cat === 'J' ? 12 : 26 }}>
              점수표 — {cat === 'J' ? '주니어' : '시니어'} 부문
            </h2>
            <p className="mt-1 text-[#6b6b6b]">
              {cat === 'J'
                ? '2017년~2013년 출생자. 검체와 분류 대상은 고정 위치에 배치합니다.'
                : '2012년~2009년 출생자. 검체와 분류 대상은 두 경기장에 무작위·대칭으로 배치합니다.'}
            </p>
          </div>
          <img src="/images/ai-for-good.png" alt="AI for Good" style={{ height: 34, marginTop: 4 }} />
        </div>

        {/* 경기 정보 */}
        <div className="mt-3 flex gap-2">
          <InfoBox label="경기" width={92} value={isTournament ? match.label : `${match.table}조`} />
          <InfoBox label="테이블" width={92} value={isTournament ? (match.field === '좌' ? 'A' : 'B') : match.wave} />
          <InfoBox label="라운드" width={92} value={isTournament ? '토너먼트' : `${match.round}차`} />
          <InfoBox label="팀" grow value={`${team.id} · ${team.name}${team.org ? ` (${team.org})` : ''}`} />
          <InfoBox label="심판" width={150} value={judgeName} />
        </div>

        <Section
          title="미션 1 — 검체 격리 및 관리"
          color={C.m1}
          desc="경기장의 최종 상태만 확인합니다."
          rows={M1_ROWS(cat)}
          resolve={resolve}
          subtotalLabel="미션 1 소계:"
          subtotal={score.sum.M1}
        />

        <Section
          title="미션 2 — 의료 관리"
          color={C.m2}
          desc="H/PCC에 키트를 배치합니다. 색상별로 올바른 목적지에 분류합니다."
          rows={M2_ROWS(cat)}
          resolve={resolve}
          subtotalLabel="미션 2 소계:"
          subtotal={score.sum.M2}
          note="참고: 노란색은 2 + 2로 나뉘어 있을 때만 보너스를 받습니다. 모두 한 PCC 안에 있으면 오류로 보지 않습니다."
        />

        <Section
          title="일반 벌점"
          color={C.pen}
          desc="라운드 중 위반에만 적용합니다. DQ = 실격될 수 있음."
          rows={PEN_ROWS}
          resolve={resolve}
          subtotalLabel="일반 벌점 소계:"
          subtotal={score.sum.PEN}
          note={cat === 'S' ? '시니어 전용 감점은 해당 미션 소계에 이미 포함되어 있습니다.' : undefined}
        />

        {/* 패널티 횟수 (채점표에는 사유를 적지 않는다) */}
        <div className="mt-2 flex items-center justify-between rounded-md px-2 py-[3px] font-bold" style={{ background: C.points }}>
          <span>패널티 횟수</span>
          <span className="font-extrabold tabular-nums">{penaltyCount(values, ruleItems)}회</span>
        </div>

        {/* 합계 */}
        <div className="mt-4 flex gap-2">
          <SumBox label="미션 1" value={score.sum.M1} width={150} />
          <SumBox label="미션 2" value={score.sum.M2} width={150} />
          <SumBox label="일반 벌점" value={score.sum.PEN} grow />
          <SumBox label="총점" value={score.dq ? '0 (실격)' : score.total} width={196} dark />
        </div>

        {/* 서명 */}
        <div className="mt-2 grid grid-cols-2 gap-3">
          <SignBox label="심판 서명" img={sheet.refSig} caption={[sheet.refName ?? judgeName, fmtDate(sheet.refSignedAt)].filter(Boolean).join(' · ')} />
          <SignBox
            label="팀 확인"
            img={sheet.teamSig}
            fallback={sheet.signException ? `서명 예외: ${sheet.signException}` : undefined}
            caption={[sheet.teamSig ? sheet.teamSigner ?? team.members[0] : '', fmtDate(sheet.teamSignedAt)].filter(Boolean).join(' · ')}
          />
        </div>
      </div>
    </div>
  );
});

function InfoBox({ label, value, width, grow }: { label: string; value?: ReactNode; width?: number; grow?: boolean }) {
  return (
    <div className="rounded-md px-2 py-1.5" style={{ background: C.cell, width, flex: grow ? 1 : undefined, minHeight: 44 }}>
      <p className="text-[#555]">{label}</p>
      <p className="truncate font-bold" style={{ fontSize: 12 }}>{value}</p>
    </div>
  );
}

function Section({
  title,
  color,
  desc,
  rows,
  resolve,
  subtotalLabel,
  subtotal,
  note,
  reasons,
}: {
  title: string;
  color: string;
  desc: string;
  rows: RowSpec[];
  resolve: (row: RowSpec) => { qty: number; points: string; calcText: string };
  subtotalLabel: string;
  subtotal: number;
  note?: string;
  reasons?: (row: RowSpec) => { key: string; reason: string }[];
}) {
  return (
    <section className="mt-3">
      <h3 className="rounded-md px-2 py-[3px] font-extrabold" style={{ background: color, fontSize: 14 }}>{title}</h3>
      <p className="italic" style={{ fontSize: 11 }}>{desc}</p>

      <div className="mt-[2px] text-center font-bold" style={{ ...GRID, fontSize: 13 }}>
        <div className="rounded-md py-[2px]" style={{ background: C.head, marginRight: 10 }}>항목</div>
        <div className="rounded-md py-[2px]" style={{ background: C.head }}>표시</div>
        <div className="rounded-md py-[2px]" style={{ background: C.head }}>계산</div>
        <div className="rounded-md py-[2px]" style={{ background: C.head }}>점수</div>
      </div>

      {rows.map((row) => {
        const r = resolve(row);
        const why = reasons?.(row) ?? [];
        return (
          <div key={row.label}>
          <div className="mt-[4px]" style={GRID}>
            <div className="flex items-center rounded-md px-2" style={{ background: C.cell, marginRight: 10, minHeight: 23 }}>{row.label}</div>
            <div className="flex items-center justify-center rounded-md" style={{ border: `1px solid ${C.cell}`, minHeight: 23 }}>
              <MarkCell row={row} qty={r.qty} />
            </div>
            <div className="flex items-center justify-center font-bold">{r.calcText}</div>
            <div className="flex items-center justify-end rounded-md px-2 font-bold tabular-nums" style={{ background: C.points }}>{r.points}</div>
          </div>
          {why.map((e, i) => (
            <div key={e.key} className="mt-[2px]" style={GRID}>
              <div className="flex items-center gap-2" style={{ gridColumn: 'span 2', fontSize: 11.5 }}>
                <span className="shrink-0 text-center font-bold text-[#c62828]" style={{ width: 30 }}>{i + 1}회</span>
                <span className="min-w-0 flex-1 rounded-[4px] px-1.5" style={{ border: `1px solid ${C.cell}`, minHeight: 19 }}>
                  {e.reason || <span className="text-[#999]">사유 없음</span>}
                </span>
              </div>
            </div>
          ))}
          </div>
        );
      })}

      <div className="mt-[6px]" style={{ display: 'grid', gridTemplateColumns: '1fr 182px', columnGap: 6 }}>
        <div className="rounded-md px-2 py-[3px] font-bold" style={{ background: C.points }}>{subtotalLabel}</div>
        <div className="rounded-md px-2 py-[3px] text-right font-extrabold tabular-nums" style={{ background: C.points }}>{subtotal}</div>
      </div>
      {note && <p className="mt-[2px] italic" style={{ fontSize: 11 }}>{note}</p>}
    </section>
  );
}

function MarkCell({ row, qty }: { row: RowSpec; qty: number }) {
  if (row.kind === 'dq') {
    return (
      <div className="flex items-center" style={{ gap: 4 }}>
        <Bubble on={qty === 0} width={44}>아니오</Bubble>
        <Bubble on={qty !== 0} width={44}>예</Bubble>
      </div>
    );
  }
  if (row.kind === 'counter' || row.kind === 'damage') {
    return <Bubble on={qty > 0} width={64}>{qty}회</Bubble>;
  }
  if (row.kind === 'count') {
    const max = row.marks ?? 3;
    const options = Array.from({ length: Math.max(max, qty) + 1 }, (_, i) => i);
    const dense = options.length > 6;
    return (
      <div className="flex items-center" style={{ gap: dense ? 2 : 10 }}>
        {options.map((o) => (
          <Bubble key={o} on={o === qty} width={dense ? 20 : 34}>{o}</Bubble>
        ))}
      </div>
    );
  }
  return (
    <div className="flex items-center" style={{ gap: 4 }}>
      <Bubble on={qty === 0} width={44}>아니오</Bubble>
      <Bubble on={qty !== 0} width={44}>예</Bubble>
    </div>
  );
}

function Bubble({ on, width, children }: { on: boolean; width: number; children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-[4px] font-bold tabular-nums"
      style={{
        width,
        height: 19,
        fontSize: 12,
        background: on ? '#111' : '#fff',
        color: on ? '#fff' : '#111',
        boxShadow: on ? undefined : `0 0 0 1px ${C.cell}`,
      }}
    >
      {children}
    </span>
  );
}

function SumBox({ label, value, width, grow, dark }: { label: string; value: ReactNode; width?: number; grow?: boolean; dark?: boolean }) {
  return (
    <div
      className="flex items-center justify-between rounded-md px-2 py-[5px] font-bold"
      style={{ background: dark ? C.head : C.cell, width, flex: grow ? 1 : undefined, fontSize: 13 }}
    >
      <span>{label}</span>
      <span className="font-extrabold tabular-nums">{value}</span>
    </div>
  );
}

function SignBox({ label, img, caption, fallback }: { label: string; img?: string; caption?: string; fallback?: string }) {
  return (
    <div className="rounded-md px-2 py-1.5" style={{ background: C.cell, minHeight: 46 }}>
      <p className="text-[#444]">{label}</p>
      {img ? (
        <img src={img} alt={label} style={{ height: 56, objectFit: 'contain' }} />
      ) : fallback ? (
        <p className="text-[#666]" style={{ fontSize: 11 }}>{fallback}</p>
      ) : null}
      {caption && <p className="text-[#555]" style={{ fontSize: 10.5 }}>{caption}</p>}
    </div>
  );
}

// 채점지 노드 여러 장을 A4 한 장씩 이어 붙여 하나의 PDF로 저장한다
export async function downloadScoreSheetsPdf(nodes: HTMLDivElement[], fileName: string) {
  if (nodes.length === 0) throw new Error('내려받을 채점지가 없습니다');
  const [{ toPng }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  // 양식 자체에 A4 여백이 들어 있으므로 페이지에 꽉 맞춘다 (내용이 길면 비율을 유지해 축소)
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  for (const [i, node] of nodes.entries()) {
    // 캡처 도중 화면이 바뀌어 노드가 사라질 수 있으므로 크기는 캡처 전에 재고, 비율은 결과 이미지에서 구한다
    const width0 = node.offsetWidth;
    const height0 = node.offsetHeight;
    if (!width0 || !height0) throw new Error('채점지 양식이 화면에 그려지지 않았습니다');
    const png = await toPng(node, { pixelRatio: 2, backgroundColor: '#ffffff', width: width0, height: height0 });
    const img = pdf.getImageProperties(png);
    if (!img.width || !img.height) throw new Error('채점지 이미지를 만들지 못했습니다');
    if (i > 0) pdf.addPage();
    const ratio = img.height / img.width;
    const width = Math.min(pageWidth, pageHeight / ratio);
    // 'FAST' = PNG 데이터를 압축해 넣는다 (무압축이면 한 장에 10MB 가까이 된다)
    pdf.addImage(png, 'PNG', (pageWidth - width) / 2, 0, width, width * ratio, undefined, 'FAST');
  }
  pdf.save(`${safeFileName(fileName).replace(/\s+/g, '-')}.pdf`);
}

const safeFileName = (value: string) => value.replace(/[\\/:*?"<>|]/g, '-');

// 경기 ID → '1차 경기' / '8강 2경기' 같은 표기
export function scoreSheetGameLabel(match: Pick<Match, 'id' | 'round'>) {
  const tournament = /^T:[JS]:(QF|SF|F|3P):(\d+):[AB]$/.exec(match.id);
  const roundLabel: Record<string, string> = { QF: '8강', SF: '4강', F: '결승', '3P': '3·4위전' };
  return tournament ? `${roundLabel[tournament[1]]} ${tournament[2]}경기` : `${match.round}차 경기`;
}

export async function downloadScoreSheetPdf(node: HTMLDivElement, match: Match, team: Team) {
  await downloadScoreSheetsPdf([node], `${team.name}-${scoreSheetGameLabel(match)}`);
}
