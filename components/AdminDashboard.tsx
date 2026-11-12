'use client';

import Image from 'next/image';
import { useState } from 'react';
import { TEAMS, teamName } from '@/lib/judge/data';
import { CATEGORY_NAMES, type Category } from '@/lib/judge/rules';
import { BracketCanvas, SEED_ORDER, useRanking } from './TournamentBracket';

type Tab = 'dashboard' | 'scores' | 'template' | 'draw' | 'teams' | 'settings';

const nav: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: '대시보드', icon: 'dashboard' },
  { id: 'scores', label: '채점 목록', icon: 'fact_check' },
  { id: 'template', label: '채점표 템플릿', icon: 'table_chart' },
  { id: 'draw', label: '토너먼트 배정', icon: 'shuffle' },
  { id: 'teams', label: '팀 · 계정', icon: 'group' },
  { id: 'settings', label: '설정', icon: 'settings' },
];

const activity = [
  ['방급 전', '정다은 심판', '경기 2-4 채점표를 제출했습니다.'],
  ['3분 전', '운영 관리자', '팀 15 · 오로라의 점수를 확정했습니다.'],
  ['8분 전', '김민재 심판', '경기 1-8 채점표를 임시저장했습니다.'],
  ['12분 전', '운영 관리자', '로봇 검사 항목 배점을 수정했습니다.'],
];

const pending = [
  ['2차 · 테이블 A', '팀 07  미라클 메이커스', '정다은', '09:43'],
  ['2차 · 테이블 C', '팀 12  쿼크', '김민재', '09:39'],
  ['1차 · 테이블 B', '팀 03  레인보우', '박수현', '09:31'],
];

const card = 'rounded-2xl border border-line bg-white';
const btn = 'rounded-2xl border border-line px-3 py-2 text-sm font-semibold hover:border-line-hover';
const btnPrimary = 'rounded-2xl bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-soft';

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined select-none ${className}`} style={{ fontSize: 20 }} aria-hidden>{name}</span>;
}

function Stat({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <div className={`${card} p-5`}>
      <p className="text-sm text-gray-500">{title}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-gray-400">{sub}</p>
    </div>
  );
}

function Progress({ label, done, pct }: { label: string; done: string; pct: number }) {
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-gray-500">{done}</span>
      </div>
      <div className="mt-2 h-1.5 bg-surface-secondary">
        <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Dashboard() {
  const judges = [['정다은', 'A', 4], ['김민재', 'B', 3], ['박수현', 'C', 4], ['이현우', 'D', 2]] as const;
  return (
    <>
      <h1 className="text-3xl font-extrabold text-heading">대시보드</h1>
      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat title="전체 경기" value="32" sub="완료 21 · 진행 3" />
        <Stat title="진행률" value="65.6%" sub="" />
        <Stat title="확정 대기" value="3" sub="" />
        <Stat title="제출 심판" value="8 / 10" sub="미제출 2명" />
      </section>
      <section className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
        <div className={`${card} p-6`}>
          <h2 className="font-semibold">라운드별 진행 현황</h2>
          <div className="mt-6 space-y-5">
            <Progress label="1차 경기" done="16 / 16" pct={100} />
            <Progress label="2차 경기" done="5 / 12" pct={42} />
            <Progress label="결승 토너먼트" done="15:00 시작" pct={0} />
          </div>
        </div>
        <div className={`${card} p-6`}>
          <h2 className="font-semibold">심판별 제출 현황</h2>
          <div className="mt-5 space-y-4">
            {judges.map(([n, t, c]) => (
              <div key={n}>
                <div className="flex justify-between text-sm">
                  <span>{n} <span className="text-gray-400">테이블 {t}</span></span>
                  <span className="tabular-nums">{c} / 4</span>
                </div>
                <div className="mt-2 h-1.5 bg-surface-secondary"><div className="h-full bg-accent" style={{ width: `${c * 25}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <div className={card}>
          <div className="flex items-center justify-between px-6 py-4">
            <h2 className="font-semibold">확정 대기</h2>
            <button className="text-sm text-gray-500 underline">전체 보기</button>
          </div>
          <div>
            {pending.map(p => (
              <div className="flex items-center gap-3 px-6 py-3" key={p[1]}>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-500">{p[0]} · 심판 {p[2]}</p>
                  <p className="truncate text-sm font-medium">{p[1]}</p>
                </div>
                <span className="hidden text-xs text-gray-400 sm:block">{p[3]}</span>
                <button className={btn}>검토</button>
              </div>
            ))}
          </div>
        </div>
        <div className={card}>
          <div className="px-6 py-4"><h2 className="font-semibold">처리 이력</h2></div>
          <div>
            {activity.map(a => (
              <div className="px-6 py-3" key={a[1] + a[0]}>
                <p className="text-sm"><b className="font-medium">{a[1]}</b> {a[2]}</p>
                <p className="mt-0.5 text-xs text-gray-400">{a[0]}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function ScoreList() {
  const [filter, setFilter] = useState('전체');
  const scores = [
    ['2차', '테이블 A', '07 · 미라클 메이커스', '주니어', '94', '확정 대기'],
    ['2차', '테이블 C', '12 · 쿼크', '시니어', '88', '확정 대기'],
    ['1차', '테이블 B', '03 · 레인보우', '주니어', '91', '확정'],
    ['1차', '테이블 A', '15 · 오로라', '시니어', '86', '수정됨'],
  ];
  return (
    <section className={`${card} p-6`}>
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold text-heading">채점 목록</h1>
        <button className={btn}>CSV 내보내기</button>
      </div>
      <div className="mt-5 flex gap-2">
        {['전체', '확정 대기', '확정', '수정됨'].map(x => (
          <button key={x} onClick={() => setFilter(x)} className={`rounded-2xl border px-3 py-1.5 text-sm ${filter === x ? 'border-accent bg-accent text-white' : 'border-line text-gray-600 hover:border-line-hover'}`}>{x}</button>
        ))}
      </div>
      <div className="mt-5 overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="bg-accent text-white">
            <tr>
              <th className="px-4 py-3 font-semibold">라운드</th>
              <th className="px-4 py-3 font-semibold">테이블</th>
              <th className="px-4 py-3 font-semibold">참가팀</th>
              <th className="px-4 py-3 font-semibold">부문</th>
              <th className="px-4 py-3 text-right font-semibold">총점</th>
              <th className="px-4 py-3 font-semibold">상태</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {scores.filter(x => filter === '전체' || x[5] === filter).map(s => (
              <tr key={s[2]}>
                <td className="px-4 py-3">{s[0]}</td>
                <td className="px-4 py-3">{s[1]}</td>
                <td className="px-4 py-3 font-medium">{s[2]}</td>
                <td className="px-4 py-3">{s[3]}</td>
                <td className="px-4 py-3 text-right tabular-nums">{s[4]}</td>
                <td className="px-4 py-3 text-gray-600">{s[5]}</td>
                <td className="px-4 py-3 text-right"><button className={`${btn} !py-1`}>상세</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Template() {
  const rows = [['샘플 수거', '6', '10점', '8점'], ['구급 키트 운반', '4', '8점', '10점'], ['실린더 적재', '3', '12점', '12점'], ['로봇 검사 통과', '1', '10점', '10점']];
  return (
    <section className={`${card} p-6`}>
      <h1 className="text-3xl font-extrabold text-heading">채점표 템플릿</h1>
      <div className="mt-6 overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="bg-accent text-white">
            <tr>
              <th className="px-4 py-3 font-semibold">채점 항목</th>
              <th className="px-4 py-3 font-semibold">최대 개수</th>
              <th className="px-4 py-3 font-semibold">주니어</th>
              <th className="px-4 py-3 font-semibold">시니어</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(r => (
              <tr key={r[0]}>
                <td className="px-4 py-3 font-medium">{r[0]}</td>
                <td className="px-4 py-3">{r[1]}개</td>
                <td className="px-4 py-3">{r[2]}</td>
                <td className="px-4 py-3">{r[3]}</td>
                <td className="px-4 py-3 text-right"><button className={`${btn} !py-1`}>수정</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-6 flex gap-2">
        <button className={`${btnPrimary} inline-flex items-center gap-1`}><Icon name="add" />항목 추가</button>
        <button className={btn}>기본값 복원</button>
      </div>
    </section>
  );
}

function Draw() {
  const [cat, setCat] = useState<Category>('S');
  const ranking = useRanking(cat);
  const [slots, setSlots] = useState<(string | undefined)[]>(Array(16).fill(undefined));
  const [picked, setPicked] = useState<string>();
  const [applied, setApplied] = useState(false);
  const placed = new Set(slots.filter(Boolean));
  const count = placed.size;
  const complete = count === Math.min(16, ranking.length) && count > 0;

  const change = (fn: (prev: (string | undefined)[]) => (string | undefined)[]) => {
    setSlots(fn);
    setApplied(false);
  };
  const switchCat = (c: Category) => {
    setCat(c);
    setSlots(Array(16).fill(undefined));
    setPicked(undefined);
    setApplied(false);
  };
  const onDrop = (slot: number, payload: string) => {
    const [kind, val] = payload.split(':');
    change((prev) => {
      const next = [...prev];
      if (kind === 'slot') {
        const from = Number(val);
        [next[from], next[slot]] = [next[slot], next[from]]; // 칸끼리는 자리 교환
      } else if (kind === 'team') {
        const old = next.indexOf(val);
        if (old >= 0) next[old] = undefined;
        next[slot] = val;
      }
      return next;
    });
    setPicked(undefined);
  };
  const onClear = (slot: number) => change((prev) => prev.map((t, i) => (i === slot ? undefined : t)));
  const autoFill = () => change(() => SEED_ORDER.map((seed) => ranking[seed - 1]?.teamId));

  return (
    <section className={`${card} p-6`}>
      <h1 className="text-3xl font-extrabold text-heading">팀 토너먼트 배정</h1>
      <p className="mt-2 text-sm text-gray-500">1차·2차 점수를 합산한 순위입니다. 팀을 끌어서 점선 칸에 놓으면 토너먼트에 반영됩니다. (터치: 팀을 누른 뒤 칸을 누르세요)</p>
      <nav className="mt-4 flex gap-2 border-b border-line">
        {(['S', 'J'] as Category[]).map((c) => (
          <button key={c} onClick={() => switchCat(c)} className={`px-4 py-2 text-sm font-bold ${cat === c ? 'border-b-2 border-accent text-accent' : 'text-gray-500'}`}>{CATEGORY_NAMES[c]}</button>
        ))}
      </nav>
      <div className="mt-6 grid gap-6 xl:grid-cols-[260px_1fr]">
        <div
          className="rounded bg-[#e5f3ff] p-4"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const [kind, val] = e.dataTransfer.getData('text/plain').split(':');
            if (kind === 'slot') onClear(Number(val));
          }}
        >
          <div className="flex items-center justify-between"><h2 className="font-semibold">합산 순위</h2><span className="text-xs text-gray-500">{count}/{Math.min(16, ranking.length)} 배치</span></div>
          <ol className="mt-3 space-y-2">
            {ranking.map((r, i) => {
              const used = placed.has(r.teamId);
              return (
                <li key={r.teamId}>
                  <button
                    type="button"
                    draggable={!used}
                    disabled={used}
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', `team:${r.teamId}`)}
                    onClick={() => setPicked((p) => (p === r.teamId ? undefined : r.teamId))}
                    className={`flex w-full items-center gap-2 rounded border bg-white px-3 py-2 text-left text-sm ${picked === r.teamId ? 'border-accent' : 'border-line'} ${used ? 'opacity-40' : 'cursor-grab hover:border-line-hover'}`}
                  >
                    <span className="w-6 font-bold tabular-nums text-accent">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{teamName(r.teamId)}</span>
                    <span className="tabular-nums text-gray-500">{r.total}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="mt-4 flex gap-2">
            <button onClick={autoFill} className={btn}>시드 자동 배치</button>
            <button onClick={() => change(() => Array(16).fill(undefined))} className={btn}>초기화</button>
          </div>
        </div>
        <div className="min-w-0">
          <div className="overflow-x-auto">
            <BracketCanvas slots={slots} seeding={{ slots, onDrop, onClear, picked }} />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button disabled={!complete || applied} onClick={() => setApplied(true)} className={`${btnPrimary} disabled:opacity-40`}>{applied ? '토너먼트 적용 완료' : '토너먼트 확정 · 적용'}</button>
            {!complete && <span className="text-xs text-gray-500">모든 팀을 배치해 주세요</span>}
          </div>
          {applied && <p className="mt-3 rounded-xl bg-[#eaf5ff] p-3 text-sm text-[#258eed]">토너먼트 대진이 확정됐습니다.</p>}
        </div>
      </div>
    </section>
  );
}

function Teams() {
  return (
    <section className={`${card} p-6`}>
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold text-heading">팀 · 계정</h1>
        <button className={`${btn} inline-flex items-center gap-1`}><Icon name="download" />계정 CSV</button>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat title="참가팀" value={String(TEAMS.length)} sub="주니어 16 · 시니어 16" />
        <Stat title="활성 계정" value="29" sub="최근 24시간" />
        <Stat title="미접속" value="3" sub="" />
      </div>
      <div className="mt-6 overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead className="bg-accent text-white">
            <tr>
              <th className="px-4 py-3">부문</th>
              <th className="px-4 py-3">팀</th>
              <th className="px-4 py-3">팀코드</th>
              <th className="px-4 py-3">지역 · 소속</th>
              <th className="px-4 py-3">지도자</th>
              <th className="px-4 py-3">참가자</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {TEAMS.map((team) => (
              <tr key={team.id}>
                <td className="px-4 py-3">{team.cat === 'J' ? '주니어' : '시니어'}</td>
                <td className="px-4 py-3 font-medium">{team.id} · {team.name}</td>
                <td className="px-4 py-3">{team.code}</td>
                <td className="px-4 py-3">{team.region} · {team.org}</td>
                <td className="px-4 py-3">{team.coach}</td>
                <td className="px-4 py-3">{team.members.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className={`${btn} mt-6`}>비밀번호 일괄 재발급</button>
    </section>
  );
}

function Settings({ notice, setNotice }: { notice: string; setNotice: (x: string) => void }) {
  const [flags, setFlags] = useState([true, true, false]);
  const items = ['자동 확정', '보드 공개', '점수 가리기'];
  return (
    <section className={`${card} max-w-3xl p-6`}>
      <h1 className="text-3xl font-extrabold text-heading">설정</h1>
      <div className="mt-6 space-y-5">
        <label className="block">
          <span className="text-sm font-medium">공지</span>
          <textarea value={notice} onChange={e => setNotice(e.target.value)} className="mt-2 h-24 w-full rounded-lg border border-line bg-white p-3 text-sm" />
        </label>
        {items.map((label, i) => (
          <label key={label} className="flex cursor-pointer items-center justify-between pt-4 text-sm">
            {label}
            <input type="checkbox" className="size-4 accent-accent" checked={flags[i]} onChange={() => setFlags(f => f.map((v, j) => (j === i ? !v : v)))} />
          </label>
        ))}
      </div>
      <button className={`${btnPrimary} mt-6`}>저장</button>
    </section>
  );
}

export default function AdminDashboard({ name }: { name: string }) {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [notice, setNotice] = useState('결승 진출 팀 발표는 16:30에 진행됩니다.');
  const content =
    tab === 'scores' ? <ScoreList /> :
    tab === 'template' ? <Template /> :
    tab === 'draw' ? <Draw /> :
    tab === 'teams' ? <Teams /> :
    tab === 'settings' ? <Settings notice={notice} setNotice={setNotice} /> :
    <Dashboard />;
  return (
    <div className="min-h-screen bg-surface text-gray-900">
      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col bg-white p-3 lg:flex">
          <Image src="/images/logo.png" alt="전국민 AI 경진대회" width={200} height={40} priority className="mb-4 h-8 w-auto self-start px-3 box-content" />
          {nav.map(item => (
            <button key={item.id} onClick={() => setTab(item.id)} className={`mb-0.5 flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm ${tab === item.id ? 'bg-surface-secondary font-medium text-heading' : 'text-gray-600 hover:bg-surface'}`}>
              <Icon name={item.icon} />{item.label}
            </button>
          ))}
          <p className="mt-auto flex items-center gap-1 px-3 py-2 text-sm text-gray-600"><Icon name="person" />{name}</p>
        </aside>
        <main className="min-w-0 flex-1 p-5 sm:p-8">
          <div className="mx-auto max-w-[1200px]">
            <Image src="/images/logo.png" alt="전국민 AI 경진대회" width={200} height={40} className="mb-4 h-8 w-auto lg:hidden" />
            <div className="mb-6 flex gap-2 overflow-x-auto lg:hidden">
              {nav.map(x => (
                <button key={x.id} onClick={() => setTab(x.id)} className={`whitespace-nowrap rounded-2xl border px-3 py-1.5 text-sm ${tab === x.id ? 'border-accent bg-accent text-white' : 'border-line bg-white text-gray-600'}`}>{x.label}</button>
              ))}
            </div>
            {content}
          </div>
        </main>
      </div>
    </div>
  );
}
