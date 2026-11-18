'use client';

import { forwardRef, type ReactNode } from 'react';
import { Poppins } from 'next/font/google';
import type { Match, Team } from '@/lib/contest';
import { calc, ITEMS, unitPoints, type Calc, type Category, type Item, type Mission, type Values } from '@/lib/judge/rules';
import type { Sheet } from '@/lib/judge/sheets';

// 공식 양식 「V4_ENG - Robotics for Good Youth Challenge 2026–2027 Score sheet」을 그대로 옮긴 PDF 레이아웃.
// A4(794×1123px @96dpi) 한 장에 맞춰 그린 뒤 이미지로 떠서 PDF 에 꽉 채워 넣는다.

const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700'], style: ['normal', 'italic'] });

type Props = {
  judgeId: string;
  judgeName: string;
  match: Match;
  team: Team;
  sheet: Sheet;
  ruleItems: Item[];
};

type Mark = { options: (number | string)[]; picked: number | string };
type Row = { label: string; mark: Mark; calc: string; points: ReactNode };

const PAGE_W = 794;
const PAGE_H = 1123;
const COLS = 'grid grid-cols-[302px_222px_77px_76px] gap-x-[5px]';

const SECTION: Record<Mission, { title: string; hint: string; bar: string; note?: (cat: Category) => string | null }> = {
  M1: { title: 'Mission 1 — Sample containment and management', hint: 'Check only the final state of the field.', bar: 'bg-[#fde3c8]' },
  M2: {
    title: 'Mission 2 — Healthcare management',
    hint: 'Kits at H/PCC. Triage by colour according to correct destination.',
    bar: 'bg-[#c5dfe3]',
    note: () => 'Note: yellows only get the bonus if 2 + 2 remain. If all are inside one PCC, it is not considered an error.',
  },
  PEN: {
    title: 'General penalties',
    hint: 'Only for infractions during the round. DQ = may result in disqualification.',
    bar: 'bg-[#fccaca]',
    note: (cat) => (cat === 'S' ? 'The specific Senior penalties are already included in the subtotal of the corresponding mission.' : null),
  },
};

const SUBTOTAL: Record<Mission, string> = { M1: 'Subtotal mission 1:', M2: 'Subtotal mission 2:', PEN: 'Subtotal general penalties:' };

const range = (max: number) => Array.from({ length: max + 1 }, (_, i) => i);

function buildRows(cat: Category, values: Values, score: Calc, items: Item[]): Record<Mission, Row[]> {
  const n = (k: string) => Number(values[k]) || 0;
  const unit = (id: string) => {
    const it = items.find((x) => x.id === id) ?? ITEMS.find((x) => x.id === id);
    return it ? unitPoints(it, cat) : 0;
  };
  const sub = (...ids: string[]) => score.lines.filter((l) => ids.includes(l.it.id)).reduce((s, l) => s + l.sub, 0);
  const auto = (id: string) => (score.lines.find((l) => l.it.id === id)?.q ?? 0) > 0;

  const count = (label: string, ids: string[], max: number): Row => {
    const q = ids.reduce((s, id) => s + n(id), 0);
    // 공식 양식의 칸보다 많이 기록된 경우(감점 4회 이상 등)에도 실제 값이 보이도록 칸을 하나 덧붙인다
    const options: (number | string)[] = range(max);
    if (q > max) options.push(q);
    const p = unit(ids[0]);
    return { label, mark: { options, picked: q }, calc: `num x ${p}`, points: sub(...ids) };
  };
  const bonus = (label: string, id: string, on: boolean): Row => {
    const p = unit(id);
    return { label, mark: { options: ['NO', 'YES'], picked: on ? 'YES' : 'NO' }, calc: `${p > 0 ? '+' : ''}${p}`, points: sub(id) };
  };
  const dq = (label: string, key: string): Row => ({
    label,
    mark: { options: ['NO', 'YES'], picked: values[key] ? 'YES' : 'NO' },
    calc: 'DQ',
    points: values[key] ? <span className="font-bold text-[#c62828]">DQ</span> : '',
  });

  const senior = cat === 'S';
  const M1: Row[] = [
    count('Samples inside a laboratory slot', ['s_slot'], 3),
    bonus('Bonus: 3 samples inside the laboratory', 'b_samples', auto('b_samples')),
    ...(senior
      ? [count('Samples outside quarantine and laboratory zones', ['s_out'], 3), count('Samples in quarentine zone', ['s_quar'], 3)]
      : []),
    count('Beams in the correct position, upright and stable', ['beam'], 2),
    bonus('Bonus: complete quarantine perimeter', 'closed', !!values.closed),
  ];
  const M2: Row[] = [
    count('Healthcare kits inside H or PCC', ['kit_h', 'kit_l', 'kit_r'], 10),
    bonus('Bonus: distribution 6 H + 2 PCC + 2 PCC', 'b_kits', auto('b_kits')),
    ...(senior
      ? [{
          label: 'H/PCC zones without any kit',
          mark: { options: range(3), picked: score.lines.find((l) => l.it.id === 'p_kitzone')?.q ?? 0 },
          calc: `num x ${unit('p_kitzone')}`,
          points: sub('p_kitzone'),
        }]
      : []),
    count('Red cylinders inside H', ['red_h'], 4),
    bonus('Bonus: 4 red cylinders inside H', 'b_red', auto('b_red')),
    count('Yellow cylinders inside a PCC', ['yel_l', 'yel_r'], 4),
    bonus('Bonus: yellows split 2 + 2', 'b_yel', auto('b_yel')),
    count('Green cylinders inside the RZ area', ['grn'], 4),
    bonus('Bonus: 4 greens inside RZ', 'b_grn', auto('b_grn')),
    ...(senior
      ? [
          count('Red cylinders outside H', ['red_out'], 4),
          count('Yellow cylinders outside PCC', ['yel_out'], 4),
          count('Green cylinders outside RZ', ['grn_out'], 4),
        ]
      : []),
  ];
  const PEN: Row[] = [
    count('Touching the robot during the round', ['pen_touch'], 3),
    count('Manipulating the field or the pieces', ['pen_field'], 3),
    count('Restarting or modifying the programme', ['pen_restart'], 3),
    count('Robot completely outside the field', ['pen_out'], 3),
    { label: 'Damage to structures or pieces', mark: { options: ['NO', 'YES'], picked: n('pen_damage') ? 'YES' : 'NO' }, calc: 'Referee', points: sub('pen_damage') },
    dq('Danger to the public or participants', 'dq_danger'),
    dq('Serious breach of the rules', 'dq_breach'),
  ];
  return { M1, M2, PEN };
}

export const ScoreSheetPdf = forwardRef<HTMLDivElement, Props>(function ScoreSheetPdf(
  { judgeName, match, team, sheet, ruleItems },
  ref,
) {
  const cat = match.cat;
  const score = calc(sheet.values, cat, ruleItems);
  const rows = buildRows(cat, sheet.values, score, ruleItems);
  const junior = cat === 'J';

  return (
    <div aria-hidden="true" className="pointer-events-none fixed left-[-10000px] top-0">
      <div
        ref={ref}
        className={`${poppins.className} relative flex flex-col bg-white px-[49px] text-[11px] leading-none text-[#2b2b2b]`}
        style={{ width: PAGE_W, height: PAGE_H, paddingTop: junior ? 26 : 24 }}
      >
        <Logo />

        {junior ? (
          <>
            <h1 className="mt-[26px] text-[17px] font-bold text-black">Robotics for Good Youth Challenge 2026–2027</h1>
            <p className="mt-[10px] text-[11px] text-[#777]">
              Forms to print for referees · Only results at the <b className="font-semibold text-[#555]">end of the round</b> are counted.
            </p>
            <h2 className="mt-[12px] text-[14px] font-bold text-black">Score sheets — Junior category</h2>
            <p className="mt-[9px] text-[11px] text-[#777]">People born between 2017 and 2013. Samples and triage in fixed positions.</p>
          </>
        ) : (
          <>
            <h2 className="mt-[34px] text-[14px] font-bold text-black">Score sheets — Senior category</h2>
            <p className="mt-[2px] text-[10px] text-[#777]">
              People born between 2012 and 2009. Samples and triage in random and symmetrical layout on both fields.
            </p>
          </>
        )}

        <div className="mt-[8px] flex gap-[9px]">
          <Field label="Match" value={match.label ?? `${match.table}조`} className='w-[78px]' />
          <Field label="Table" value={`${match.wave} (${match.field})`} className='w-[80px]' />
          <Field label="Round" value={match.label ? '-' : String(match.round)} className='w-[79px]' />
          <Field label="Team" value={`${team.id} · ${team.name}`} className='w-[285px]' />
          <Field label="Referee" value={judgeName} className="flex-1" />
        </div>

        {(['M1', 'M2', 'PEN'] as Mission[]).map((m) => (
          <Section key={m} mission={m} cat={cat} tight={!junior} rows={rows[m]} subtotal={score.sum[m]} />
        ))}

        <div className="mt-[8px] flex gap-[8px]">
          <Summary label="Mission 1" value={score.sum.M1} className='w-[130px]' />
          <Summary label="Mission 2" value={score.sum.M2} className='w-[133px]' />
          <Summary label="General penalties" value={score.sum.PEN} className='w-[245px]' />
          <Summary label="Total" value={score.dq ? 'DQ' : score.total} className="flex-1 bg-[#d4d4d4]" />
        </div>

        <div className="mt-[7px] flex gap-[11px]">
          <Signature
            label="Referee’s signature"
            src={sheet.refSig}
            caption={`${judgeName}${sheet.refSignedAt ? ` · ${new Date(sheet.refSignedAt).toLocaleString('ko-KR')}` : ''}`}
          />
          <Signature
            label="Team confirmation"
            src={sheet.teamSig}
            caption={
              sheet.teamSig
                ? `${sheet.teamSigner ?? team.members[0] ?? ''}${sheet.teamSignedAt ? ` · ${new Date(sheet.teamSignedAt).toLocaleString('ko-KR')}` : ''}`
                : sheet.signException
                  ? `서명 예외: ${sheet.signException}`
                  : ''
            }
          />
        </div>

        <span className="absolute bottom-[18px] right-[49px] text-[13px] text-[#333]">{junior ? 1 : 2}</span>
      </div>
    </div>
  );
});

function Logo() {
  return (
    <div className="absolute right-[44px] top-[22px] flex items-center gap-[5px]">
      <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full border-[2.5px] border-dashed border-black text-[10px] font-bold text-black">
        AI
      </span>
      <span className="text-[16px] font-semibold tracking-[-0.2px] text-black">AI for Good</span>
    </div>
  );
}

function Field({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={`flex h-[30px] flex-col justify-between rounded-[6px] bg-[#ececec] px-[7px] pb-[4px] pt-[5px] ${className}`}>
      <span className="text-[11px] text-[#555]">{label}</span>
      <span className="truncate text-right text-[10px] font-semibold text-black">{value}</span>
    </div>
  );
}

function Section({ mission, cat, rows, subtotal, tight }: { mission: Mission; cat: Category; tight: boolean; rows: Row[]; subtotal: number }) {
  const s = SECTION[mission];
  const note = s.note?.(cat);
  return (
    <section className={tight ? 'mt-[7px]' : 'mt-[12px]'}>
      <h3 className={`rounded-[4px] px-[7px] py-[4px] text-[12.5px] font-bold text-[#222] ${s.bar}`}>{s.title}</h3>
      <p className="mt-[3px] px-[7px] text-[10px] italic text-[#333]">{s.hint}</p>

      <div className={`${COLS} mt-[3px] text-center text-[12px] font-semibold text-[#222]`}>
        <span className="rounded-[4px] bg-[#cfcfcf] py-[4px]">ACTION</span>
        <span className="ml-[9px] rounded-[4px] bg-[#cfcfcf] py-[4px]">MARK</span>
        <span className="rounded-[4px] bg-[#cfcfcf] py-[4px]">CALC.</span>
        <span className="rounded-[4px] bg-[#cfcfcf] py-[4px]">POINTS</span>
      </div>

      {rows.map((row) => (
        <div key={row.label} className={`${COLS} mt-[3px] h-[20px] items-stretch`}>
          <span className="flex items-center rounded-[4px] bg-[#e6e6e6] px-[7px] text-[10.5px] text-[#333]">{row.label}</span>
          <Marks mark={row.mark} />
          <span className="flex items-center justify-center rounded-[4px] bg-[#eeeeee] text-[10.5px] font-bold text-[#222]">{row.calc}</span>
          <span className="flex items-center justify-center rounded-[4px] bg-[#f4f4f4] text-[11px] font-semibold tabular-nums text-black">
            {row.points}
          </span>
        </div>
      ))}

      <div className={`${tight ? 'mt-[5px]' : 'mt-[8px]'} grid grid-cols-[534px_1fr] gap-x-[5px]`}>
        <span className="rounded-[4px] bg-[#ededed] px-[7px] py-[5px] text-[10.5px] font-bold text-[#222]">{SUBTOTAL[mission]}</span>
        <span className="flex items-center justify-center rounded-[4px] bg-[#f4f4f4] text-[11.5px] font-bold tabular-nums text-black">{subtotal}</span>
      </div>
      {note && <p className="mt-[4px] px-[7px] text-[9.5px] italic text-[#333]">{note}</p>}
    </section>
  );
}

function Marks({ mark }: { mark: Mark }) {
  const dense = mark.options.length > 6;
  const yesNo = typeof mark.options[0] === 'string';
  return (
    <span
      className={`ml-[9px] flex items-center justify-center rounded-[4px] bg-[#f2f2f2] ${dense ? 'gap-[2px] px-[2px]' : 'gap-[4px]'}`}
    >
      {mark.options.map((opt) => {
        const on = opt === mark.picked;
        return (
          <span
            key={String(opt)}
            className={`flex h-[16px] items-center justify-center rounded-[3px] text-[10px] font-bold text-[#222] ${
              dense ? 'w-[14px]' : yesNo ? 'w-[40px]' : 'w-[34px]'
            } ${on ? 'bg-white outline outline-[1.6px] outline-black' : 'bg-white'}`}
          >
            {opt}
          </span>
        );
      })}
    </span>
  );
}

function Summary({ label, value, className = '' }: { label: string; value: number | string; className?: string }) {
  return (
    <div className={`flex h-[24px] items-center justify-between rounded-[5px] bg-[#ececec] px-[7px] text-[11px] font-bold text-[#222] ${className}`}>
      <span>{label}</span>
      <span className="tabular-nums text-black">{value}</span>
    </div>
  );
}

function Signature({ label, src, caption }: { label: string; src?: string; caption: string }) {
  return (
    <div className="relative h-[52px] flex-1 rounded-[6px] bg-[#ececec] px-[7px] pt-[5px]">
      <span className="text-[11px] text-[#444]">{label}</span>
      {src && <img src={src} alt="" className="absolute bottom-[3px] left-1/2 h-[38px] -translate-x-1/2 object-contain mix-blend-multiply" />}
      {caption && <span className="absolute bottom-[4px] right-[7px] text-[8.5px] text-[#555]">{caption}</span>}
    </div>
  );
}

export async function downloadScoreSheetPdf(node: HTMLDivElement, match: Match, team: Team) {
  const [{ toPng }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
  await document.fonts?.ready;
  const png = await toPng(node, { pixelRatio: 3, backgroundColor: '#ffffff' });
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const ratio = node.offsetHeight / node.offsetWidth;
  const width = Math.min(pageW, pageH / ratio);
  pdf.addImage(png, 'PNG', (pageW - width) / 2, 0, width, width * ratio);
  const safe = (value: string) => value.replace(/[\\/:*?"<>|]/g, '-');
  const tournament = /^T:[JS]:(QF|SF|F|3P):(\d+):[AB]$/.exec(match.id);
  const roundLabel: Record<string, string> = { QF: '8강', SF: '4강', F: '결승', '3P': '3·4위전' };
  const gameLabel = tournament ? `${roundLabel[tournament[1]]} ${tournament[2]}경기` : `${match.round}차 경기`;
  pdf.save(`${safe(team.name)}-${safe(gameLabel).replace(/\s+/g, '-')}.pdf`);
}
