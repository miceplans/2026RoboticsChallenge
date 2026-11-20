'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/components/Toast';
import SignaturePad, { type PadHandle } from '@/components/judge/SignaturePad';
import { downloadScoreSheetsPdf } from '@/components/judge/ScoreSheetPdf';
import TeamName from '@/components/team/TeamName';
import { refreshContest, useContest, type Team } from '@/lib/contest';
import {
  CATEGORY_LABEL,
  DYNAMIC_CHECKS,
  emptyHomologation,
  homologationStatus,
  MAX_ROBOTS,
  resizeRobots,
  robotApproved,
  robotIndexes,
  robotLabel,
  SHORT_LABEL,
  STATIC_CHECKS,
  staticPassed,
  type Homologation as Saved,
  type HomologationData,
  type RobotCheck,
} from '@/lib/homologation';
import { HomologationPdf, homologationPages, loadHomologationFonts } from './HomologationPdf';
import { adminFetch, btn, btnPrimary, card, fmtDate, Icon } from './shared';

// 관리자 '등록' 탭: 시니어·주니어 팀 목록에서 팀을 골라 로봇 승인서를 작성한다.
// 저장하면 공식 양식과 같은 PDF 가 바로 내려받아지고, 팀 이름 옆에 승인(파란 체크)·불가(빨간 X)가 붙는다.

type Summary = Pick<Saved, 'teamId' | 'status' | 'robots' | 'judge' | 'updatedAt'>;

const SECTIONS: { title: string; keys: readonly RobotCheck[] }[] = [
  { title: 'A) 사전 식별 (필수)', keys: ['label'] },
  { title: 'B) 정적 검사 (로봇을 멈춘 상태에서)', keys: STATIC_CHECKS.filter((k) => k !== 'label') },
  { title: 'C) 동적 검사 (짧은 시연)', keys: DYNAMIC_CHECKS },
];

// 승인표 원문의 안내 문구 (HomologationPdf 와 같은 내용)
const GUIDE: Record<RobotCheck, string> = {
  label: '시작 전에 모든 로봇에 스티커나 마커로 R1, R2, R3, R4 …(로봇 수만큼)를 분명하게 표시해야 합니다.',
  startZone: '(로봇 여러 대 허용) 모든 로봇과 부속품이 시작 구역 안에 완전히 들어가야 합니다. 선에 닿는 것은 괜찮지만 넘어가면 안 됩니다.',
  startMethod: '쉽게 조작할 수 있는 단일 시작 장치 (버튼, 스위치 또는 짧은 조작 순서).',
  autonomous: '사람의 조종 없이 작동해야 합니다 (리모컨·원격 조작 금지).',
  safety: '자르거나 찌르는 부분·날카로운 모서리 없음, 풀린 부품(나사·전선) 없음, 배터리는 단단히 고정. 경기장을 손상시키면 안 됩니다.',
  estop: '비상 정지 장치가 있고, 알아보기 쉽고, 손이 닿는 곳에 있어야 합니다.',
  dynStart: '시작 구역 안에서 신고한 장치로 한 번만 조작해 출발하고, 추가 조작이나 외부 도움 없이 스스로 시작 구역을 벗어나야 합니다.',
  dynSafe: '경기판이나 소품을 손상시키지 않고, 경기장 밖으로 나가지 않아야 합니다. 로봇이 여러 대면 서로 위험하게 부딪히거나 일부러 방해하지 않아야 합니다.',
};
const NOTES: Record<string, string[]> = {
  A: ['라벨 변경 금지: 로봇에 붙인 번호(R1, R2 …)는 대회 당일 내내 바꿀 수 없습니다.', '로봇이 R4를 넘어갈 경우, 각 항목 옆 빈칸에 번호를 수기로 적어 작성합니다.'],
  B: ['합격 기준(정적 상태): 모든 항목을 충족한 로봇은 승인되어 동적 검사로 넘어갑니다.', '하나라도 충족하지 못한 로봇은 실격이며 대회에서 사용할 수 없습니다.'],
};

export default function Homologation() {
  const toast = useToast();
  const { config } = useContest();
  const teams = useMemo(() => config?.teams ?? [], [config?.teams]);
  const [summaries, setSummaries] = useState<Record<string, Summary>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [data, setData] = useState<HomologationData | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const pdfRoot = useRef<HTMLDivElement>(null);

  const loadSummaries = () =>
    adminFetch<{ homologations: Summary[] }>('/admin/homologations')
      .then((d) => setSummaries(Object.fromEntries(d.homologations.map((h) => [h.teamId, h]))))
      .catch((e: Error) => toast(e.message));

  useEffect(() => {
    void loadSummaries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const team = teams.find((t) => t.id === selected);

  const open = async (id: string) => {
    if (id === selected) return;
    if (dirty && !confirm('저장하지 않은 내용이 있습니다. 다른 팀으로 이동할까요?')) return;
    setSelected(id);
    setData(null);
    setDirty(false);
    setLoading(true);
    try {
      const d = await adminFetch<{ homologation: Saved | null }>(`/admin/homologations/${encodeURIComponent(id)}`);
      setData(d.homologation ?? emptyHomologation(1));
    } catch (e) {
      toast((e as Error).message);
      setSelected(null);
    } finally {
      setLoading(false);
    }
  };

  const update = (fn: (d: HomologationData) => HomologationData) => {
    setData((d) => (d ? fn(d) : d));
    setDirty(true);
  };
  const toggle = (key: RobotCheck, i: number) =>
    update((d) => ({ ...d, checks: { ...d.checks, [key]: d.checks[key].map((v, j) => (j === i ? !v : v)) } }));
  const toggleRow = (key: RobotCheck) =>
    update((d) => {
      const all = d.checks[key].every(Boolean);
      return { ...d, checks: { ...d.checks, [key]: d.checks[key].map(() => !all) } };
    });

  const downloadPdf = async (t: Team) => {
    await loadHomologationFonts();
    // 상태 변경이 그려진 뒤 캡처한다
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await downloadScoreSheetsPdf(homologationPages(pdfRoot.current), `${t.name}-로봇승인서`);
  };

  const save = async () => {
    if (!team || !data) return;
    if (!data.judge.trim()) return toast('심판 / 심사위원 이름을 입력하세요.');
    if (!data.decoration) return toast('로봇 장식 항목의 예 / 아니오를 선택하세요.');
    if (!data.judgeSig) return toast('심판 / 심사위원 서명이 필요합니다.');
    if (!data.teamSig) return toast('팀 대표 서명이 필요합니다.');
    setBusy(true);
    try {
      const d = await adminFetch<{ homologation: Saved }>(`/admin/homologations/${encodeURIComponent(team.id)}`, { method: 'PUT', body: data });
      setDirty(false);
      setSummaries((s) => ({ ...s, [team.id]: d.homologation }));
      void refreshContest();
      toast(d.homologation.status === 'pass' ? `${team.name}: 승인 완료 — PDF를 내려받습니다.` : `${team.name}: 승인된 로봇 없음 — PDF를 내려받습니다.`);
      await downloadPdf(team);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!team || !summaries[team.id]) return;
    if (!confirm(`${team.name}의 로봇 승인서를 삭제할까요? 팀 이름 옆 승인 표시도 사라집니다.`)) return;
    setBusy(true);
    try {
      await adminFetch(`/admin/homologations/${encodeURIComponent(team.id)}/delete`, { method: 'POST' });
      setSummaries(({ [team.id]: _, ...rest }) => rest);
      setData(emptyHomologation(1));
      setDirty(false);
      void refreshContest();
      toast('승인서를 삭제했습니다.');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const groups: { cat: Team['cat']; list: Team[] }[] = (['S', 'J'] as const).map((cat) => ({
    cat,
    list: teams.filter((t) => t.cat === cat).sort((a, b) => a.id.localeCompare(b.id)),
  }));
  const counts = Object.values(summaries).reduce((c, s) => ({ ...c, [s.status]: c[s.status] + 1 }), { pass: 0, fail: 0 });

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-heading">로봇 승인 등록</h1>
          <p className="mt-1 text-sm text-gray-500">팀을 고르고 로봇 승인서(Homologation Sheet)를 작성합니다. 저장하면 공식 양식 PDF가 내려받아집니다.</p>
        </div>
        <p className="flex gap-3 text-sm text-gray-600">
          <span>승인 <b className="text-accent">{counts.pass}</b></span>
          <span>불가 <b className="text-error">{counts.fail}</b></span>
          <span>미등록 <b>{Math.max(0, teams.length - counts.pass - counts.fail)}</b></span>
        </p>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* 팀 목록: 시니어 · 주니어 */}
        <aside className={`${card} max-h-[calc(100vh-10rem)] self-start overflow-y-auto p-2 lg:sticky lg:top-5`}>
          {groups.map(({ cat, list }) => (
            <div key={cat} className="mb-2">
              <p className="px-3 pb-1 pt-2 text-xs font-bold text-gray-500">{CATEGORY_LABEL[cat]} · {list.length}팀</p>
              {list.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">팀이 없습니다.</p>}
              {list.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => void open(t.id)}
                  className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm ${selected === t.id ? 'bg-accent/10 font-semibold text-heading' : 'text-gray-700 hover:bg-surface'}`}
                >
                  <span className="w-[72px] shrink-0 font-mono text-xs text-gray-400">{t.id}</span>
                  <span className="min-w-0 flex-1 truncate"><TeamName id={t.id} /></span>
                </button>
              ))}
            </div>
          ))}
        </aside>

        {/* 승인서 */}
        <section className="min-w-0">
          {!team ? (
            <div className={`${card} flex min-h-[320px] flex-col items-center justify-center gap-2 p-8 text-center text-gray-500`}>
              <Icon name="verified" className="text-gray-300" />
              <p>왼쪽 목록에서 팀을 선택하세요.</p>
            </div>
          ) : loading || !data ? (
            <div className={`${card} p-8 text-center text-gray-500`}>불러오는 중…</div>
          ) : (
            <Sheet
              team={team}
              data={data}
              saved={summaries[team.id]}
              dirty={dirty}
              busy={busy}
              update={update}
              toggle={toggle}
              toggleRow={toggleRow}
              onSave={() => void save()}
              onPdf={() => void downloadPdf(team).catch((e: Error) => toast(e.message))}
              onRemove={() => void remove()}
            />
          )}
        </section>
      </div>

      {team && data && <HomologationPdf ref={pdfRoot} team={team} data={data} />}
    </div>
  );
}

function Sheet({
  team,
  data,
  saved,
  dirty,
  busy,
  update,
  toggle,
  toggleRow,
  onSave,
  onPdf,
  onRemove,
}: {
  team: Team;
  data: HomologationData;
  saved?: Summary;
  dirty: boolean;
  busy: boolean;
  update: (fn: (d: HomologationData) => HomologationData) => void;
  toggle: (key: RobotCheck, i: number) => void;
  toggleRow: (key: RobotCheck) => void;
  onSave: () => void;
  onPdf: () => void;
  onRemove: () => void;
}) {
  const robots = robotIndexes(data);
  const approved = robots.filter((i) => robotApproved(data, i));
  const pass = homologationStatus(data) === 'pass';
  const field = 'mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold text-heading';

  return (
    <div className="space-y-4">
      {/* 머리 정보 — 양식의 부문 / 제출 로봇 수 / 팀명 / 심판 */}
      <div className={`${card} p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs font-bold text-gray-400">Robotics for Good Youth Challenge 2026–2027</p>
            <h2 className="text-lg font-extrabold text-heading">로봇 승인서 (Homologation Sheet)</h2>
          </div>
          <p className="text-xs text-gray-500">
            {saved ? `저장됨 · ${fmtDate(saved.updatedAt)}` : '아직 저장하지 않음'}
            {dirty && <b className="ml-2 text-warning">변경 사항 있음</b>}
          </p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="rounded-2xl bg-surface-secondary p-3 text-xs text-gray-500">
            부문 (주니어 / 시니어)
            <p className="mt-1 px-1 py-2 text-sm font-semibold text-heading">{CATEGORY_LABEL[team.cat]}</p>
          </label>
          <label className="rounded-2xl bg-surface-secondary p-3 text-xs text-gray-500">
            제출 로봇 수
            <select
              className={field}
              value={data.robots}
              onChange={(e) => {
                const n = Number(e.target.value);
                const lost = robots.slice(n).some((i) => Object.values(data.checks).some((c) => c[i]));
                if (lost && !confirm(`R${n + 1} 이후 로봇의 체크 내용이 지워집니다. 계속할까요?`)) return;
                update((d) => resizeRobots(d, n));
              }}
            >
              {Array.from({ length: MAX_ROBOTS }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}대 ({n === 1 ? 'R1' : `R1~R${n}`})</option>
              ))}
            </select>
          </label>
          <label className="rounded-2xl bg-surface-secondary p-3 text-xs text-gray-500 sm:col-span-2">
            팀명
            <p className="mt-1 px-1 py-2 text-sm font-semibold text-heading">{team.name}</p>
          </label>
          <label className="rounded-2xl bg-surface-secondary p-3 text-xs text-gray-500 sm:col-span-2">
            심판 / 심사위원
            <input
              className={field}
              value={data.judge}
              maxLength={64}
              placeholder="이름을 입력하세요"
              onChange={(e) => {
                const judge = e.target.value;
                update((d) => ({ ...d, judge }));
              }}
            />
          </label>
        </div>
      </div>

      {/* 체크 표 */}
      <div className={`${card} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-sm">
            <thead>
              <tr className="bg-surface-secondary text-xs text-gray-500">
                <th className="sticky left-0 z-10 bg-surface-secondary px-4 py-2 text-left font-semibold">항목</th>
                {robots.map((i) => (
                  <th key={i} className="w-12 px-1 py-2 text-center font-bold text-heading">{robotLabel(i)}</th>
                ))}
                <th className="w-16 px-2 py-2 text-center font-semibold">전체</th>
              </tr>
            </thead>
            <tbody>
              {SECTIONS.map((section) => (
                <SectionRows key={section.title} title={section.title} span={data.robots + 2}>
                  {section.title.startsWith('B') && (
                    <tr className="border-t border-line">
                      <RowHead label="로봇 장식" hint="모든 로봇에 챌린지 주제와 관련된 장식 요소가 있어야 합니다. (팀 전체)" />
                      <td colSpan={data.robots + 1} className="px-3 py-2">
                        <div className="inline-flex overflow-hidden whitespace-nowrap rounded-xl border border-line">
                          {(['yes', 'no'] as const).map((v) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => update((d) => ({ ...d, decoration: v }))}
                              className={`px-4 py-1.5 text-sm font-semibold ${data.decoration === v ? (v === 'yes' ? 'bg-accent text-white' : 'bg-error text-white') : 'bg-white text-gray-600 hover:bg-surface'}`}
                            >
                              {v === 'yes' ? '예' : '아니오'}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                  {section.keys.map((key) => (
                    <tr key={key} className="border-t border-line">
                      <RowHead label={SHORT_LABEL[key]} hint={GUIDE[key]} />
                      {robots.map((i) => (
                        <td key={i} className="px-1 py-2 text-center">
                          <input
                            type="checkbox"
                            aria-label={`${SHORT_LABEL[key]} ${robotLabel(i)}`}
                            className="h-5 w-5 cursor-pointer accent-[#258eed]"
                            checked={data.checks[key][i]}
                            onChange={() => toggle(key, i)}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-2 text-center">
                        <button type="button" onClick={() => toggleRow(key)} className="rounded-lg border border-line px-2 py-0.5 text-xs text-gray-600 hover:border-line-hover">
                          {data.checks[key].every(Boolean) ? '해제' : '전체'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {NOTES[section.title[0]]?.map((note) => (
                    <tr key={note} className="border-t border-line">
                      <td colSpan={data.robots + 2} className="bg-surface px-4 py-2 text-xs text-gray-600">{note}</td>
                    </tr>
                  ))}
                </SectionRows>
              ))}
              <SectionRows title="검사 판정 (자동)" span={data.robots + 2}>
                <ResultRow label="정적 검사를 통과한 로봇" robots={robots} on={(i) => staticPassed(data, i)} />
                <ResultRow label="출전이 승인된 로봇" robots={robots} on={(i) => robotApproved(data, i)} />
              </SectionRows>
            </tbody>
          </table>
        </div>
      </div>

      {/* 팀 최종 결과 */}
      <div className={`flex flex-wrap items-center gap-3 rounded-2xl border p-4 ${pass ? 'border-accent/40 bg-accent/5' : 'border-error/40 bg-error/5'}`}>
        <span className={`text-lg font-extrabold ${pass ? 'text-accent' : 'text-error'}`}>{pass ? '✓ 출전 가능' : '✕ 출전 불가'}</span>
        <span className="text-sm text-gray-600">
          {pass ? `출전 가능 로봇: ${approved.map(robotLabel).join(', ')}` : '승인된 로봇이 한 대도 없습니다.'}
          {pass && approved.length < data.robots && ` · 출전 불가 로봇: ${robots.filter((i) => !approved.includes(i)).map(robotLabel).join(', ')}`}
        </span>
      </div>

      {/* 서명 */}
      <div className="grid gap-4 md:grid-cols-2">
        <SignField label="심판 / 심사위원 서명" value={data.judgeSig} onChange={(v) => update((d) => ({ ...d, judgeSig: v }))} />
        <SignField label="확인 및 동의 (팀 대표)" value={data.teamSig} onChange={(v) => update((d) => ({ ...d, teamSig: v }))} />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {saved && (
          <button type="button" className={`${btn} mr-auto text-error`} disabled={busy} onClick={onRemove}>
            승인서 삭제
          </button>
        )}
        {saved && !dirty && (
          <button type="button" className={btn} disabled={busy} onClick={onPdf}>
            PDF 다시 받기
          </button>
        )}
        <button type="button" className={`${btnPrimary} px-5`} disabled={busy} onClick={onSave}>
          {busy ? '처리 중…' : '저장하고 PDF 받기'}
        </button>
      </div>
    </div>
  );
}

function SectionRows({ title, span, children }: { title: string; span: number; children: React.ReactNode }) {
  return (
    <>
      <tr className="border-t border-line bg-surface">
        <td colSpan={span} className="sticky left-0 px-4 py-2 text-xs font-extrabold text-heading">{title}</td>
      </tr>
      {children}
    </>
  );
}

function RowHead({ label, hint }: { label: string; hint?: string }) {
  return (
    <th scope="row" className="sticky left-0 z-10 min-w-[180px] bg-white px-4 py-2 text-left font-medium text-heading">
      {label}
      {hint && <span className="block max-w-sm whitespace-normal text-xs font-normal text-gray-400">{hint}</span>}
    </th>
  );
}

function ResultRow({ label, robots, on }: { label: string; robots: number[]; on: (i: number) => boolean }) {
  return (
    <tr className="border-t border-line">
      <RowHead label={label} />
      {robots.map((i) => (
        <td key={i} className="px-1 py-2 text-center">
          {on(i) ? <b className="text-accent" aria-label="통과">✓</b> : <span className="text-error" aria-label="불통과">✕</span>}
        </td>
      ))}
      <td />
    </tr>
  );
}


// 서명 칸: 칸에 바로 그리면 획을 뗄 때마다 저장된다. 저장된 서명이 있으면 그 이미지를 보여 주고 '지우기'로 다시 받는다.
function SignField({ label, value, onChange }: { label: string; value?: string | null; onChange: (v: string | null) => void }) {
  const pad = useRef<PadHandle>(null);
  const inked = useRef(false);

  // 화면 배율만큼 커진 캔버스를 줄여 저장 크기를 작게 유지한다
  const capture = () => {
    const src = inked.current ? pad.current?.toDataURL() : null;
    if (!src) return;
    const img = new Image();
    img.onload = () => {
      const w = Math.min(600, img.width);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = Math.round((img.height * w) / img.width);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      onChange(c.toDataURL('image/png'));
    };
    img.src = src;
  };
  const clear = () => {
    pad.current?.clear();
    inked.current = false;
    onChange(null);
  };

  // 불러온 서명(이미지)이 있고 아직 새로 그리지 않았으면 이미지를 보여 준다
  const [showSaved, setShowSaved] = useState(Boolean(value));
  useEffect(() => {
    if (!value) setShowSaved(false);
  }, [value]);

  return (
    <div className={`${card} p-4`}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-heading">{label}</p>
        <button type="button" className="text-xs text-gray-500 hover:text-heading" onClick={() => { setShowSaved(false); clear(); }}>지우기</button>
      </div>
      {showSaved && value ? (
        <div className="flex h-[280px] items-center justify-center rounded-2xl border-2 border-dashed border-line-hover bg-white">
          <img src={value} alt={label} className="max-h-full max-w-full object-contain" />
        </div>
      ) : (
        <div onPointerUp={capture}>
          <SignaturePad ref={pad} onInk={(v) => (inked.current = v)} />
        </div>
      )}
    </div>
  );
}
