'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { TEAMS, teamOf } from '@/lib/judge/data';
import { saveRobotApproval, useRobotApproval, type RobotId } from '@/lib/judge/robotApproval';

type Tab = 'dashboard' | 'scores' | 'template' | 'robotApproval' | 'draw' | 'teams' | 'settings';

const nav: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: '대시보드', icon: 'dashboard' },
  { id: 'scores', label: '채점 목록', icon: 'fact_check' },
  { id: 'template', label: '채점표 템플릿', icon: 'table_chart' },
  { id: 'robotApproval', label: '로봇 승인', icon: 'smart_toy' },
  { id: 'draw', label: '대진 추첨', icon: 'shuffle' },
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

const robotGuide = [
  ['A) 사전 식별 (필수)', '로봇 라벨링'],
  ['B) 정적 검사 (로봇을 멈춘 상태에서)', '로봇 장식, 로봇 시작 구역, 명확한 시작 방식, 자율 작동 신고, 안전성·완성도, 비상 정지'],
  ['C) 동적 검사 (짧은 시연)', '시작 및 시작 구역 이탈, 안전하고 통제된 움직임'],
] as const;

function RobotApprovalPanel() {
  const [teamId, setTeamId] = useState(TEAMS[0].id);
  const [robotCount, setRobotCount] = useState(0);
  const [selected, setSelected] = useState<RobotId[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { approval, loading, refresh } = useRobotApproval(teamId);
  const team = teamOf(teamId);

  useEffect(() => {
    setRobotCount(approval?.robotCount ?? 0);
    setSelected(approval?.approvedRobotIds ?? []);
  }, [approval]);
  const toggle = (robot: RobotId) => setSelected((current) => current.includes(robot) ? current.filter((id) => id !== robot) : [...current, robot]);
  const robots = Array.from({ length: robotCount }, (_, index) => `R${index + 1}` as RobotId);
  const setCount = (value: number) => {
    const count = Math.max(0, Math.min(200, value || 0));
    setRobotCount(count);
    setSelected((current) => current.filter((id) => Number(id.slice(1)) <= count));
  };
  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await saveRobotApproval(teamId, robotCount, selected);
      await refresh();
      setMessage(`승인 결과를 저장했습니다. 승인 완료 ${selected.length}대`);
    } catch {
      setMessage('승인 결과를 저장하지 못했습니다. 서버 연결과 관리자 로그인을 확인해 주십시오.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={`${card} max-w-4xl p-6`}>
      <h1 className="text-3xl font-extrabold text-heading">로봇 승인</h1>
      <p className="mt-2 text-sm text-gray-500">승인한 로봇만 심판 채점 화면에 표시됩니다.</p>
      <label className="mt-6 block text-sm font-medium">
        참가팀
        <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="mt-2 block w-full rounded-lg border border-line bg-white px-3 py-2">
          {TEAMS.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.name} · {item.org}</option>)}
        </select>
      </label>
      <label className="mt-4 block text-sm font-medium">
        검차 대상 로봇 수
        <input type="number" min={0} max={200} value={robotCount} onChange={(e) => setCount(Number(e.target.value))} className="mt-2 block w-40 rounded-lg border border-line bg-white px-3 py-2" />
        <span className="mt-1 block text-xs font-normal text-gray-500">입력한 수만큼 R1부터 생성합니다. 팀별 로봇 수에 맞게 입력하십시오.</span>
      </label>
      <div className="mt-6 rounded-xl border border-line">
        <div className="border-b border-line bg-surface-secondary px-4 py-3 text-sm font-bold">{team.id} {team.name} 검차 가이드</div>
        {robotGuide.map(([title, content]) => <div key={title} className="border-b border-line px-4 py-3 last:border-0"><b className="block text-sm">{title}</b><p className="mt-1 text-sm text-gray-600">{content}</p></div>)}
      </div>
      <div className="mt-6 overflow-hidden rounded-xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-accent text-white"><tr><th className="px-4 py-3">로봇</th><th className="px-4 py-3">정적 검사</th><th className="px-4 py-3">출전 승인</th></tr></thead>
          <tbody className="divide-y divide-line">
            {robots.map((robot) => <tr key={robot}><td className="px-4 py-3 font-bold">{robot}</td><td className="px-4 py-3">검사 통과</td><td className="px-4 py-3"><label className="inline-flex cursor-pointer items-center gap-2"><input type="checkbox" checked={selected.includes(robot)} onChange={() => toggle(robot)} className="size-4 accent-accent" />승인</label></td></tr>)}
            {robots.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-500">검차 대상 로봇 수를 입력해 주십시오.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-5 flex items-center gap-3"><button type="button" disabled={saving || loading} onClick={save} className={`${btnPrimary} disabled:opacity-40`}>{saving ? '저장 중' : '승인 결과 저장'}</button>{message && <p className={`text-sm ${message.startsWith('승인 결과를 저장했습니다') ? 'text-accent' : 'text-error'}`}>{message}</p>}</div>
    </section>
  );
}

function Dropdown({ value, onChange, disabledFor }: { value: number | null; onChange: (n: number) => void; disabledFor: (n: number) => boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} className="flex w-28 items-center justify-between rounded border border-line bg-white px-3 py-1.5 text-sm hover:bg-gray-50">
        <span className={value ? '' : 'text-gray-400'}>{value ? `${value}번` : '번호 선택'}</span>
        <Icon name={open ? 'expand_less' : 'expand_more'} />
      </button>
      {open && (
        <ul className="absolute right-0 z-10 mt-1 w-28 rounded border border-line bg-white py-1 shadow-sm">
          {Array.from({ length: 8 }, (_, i) => i + 1).map(n => (
            <li key={n}>
              <button type="button" disabled={disabledFor(n)} onClick={() => { onChange(n); setOpen(false); }} className={`w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 disabled:text-gray-300 disabled:hover:bg-transparent ${value === n ? 'font-semibold' : ''}`}>{n}번</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Draw() {
  const teams = ['S01 오로라', 'S02 미라클 메이커스', 'S03 레인보우', 'S04 네오', 'S05 바이너리', 'S06 코스모스', 'S07 쿼크', 'S08 스파크'];
  const [slots, setSlots] = useState<Record<number, string>>({});
  const [applied, setApplied] = useState(false);
  const complete = Object.keys(slots).length === teams.length;
  const setSlot = (slot: number, team: string) => setSlots(prev => {
    const next = { ...prev }; Object.keys(next).forEach(k => { if (next[Number(k)] === team) delete next[Number(k)]; });
    if (team) next[slot] = team; else delete next[slot]; return next;
  });
  return (
    <section className={`${card} p-6`}>
      <h1 className="text-3xl font-extrabold text-heading">대진 추첨</h1>
      <p className="mt-2 text-sm text-gray-500">팀마다 추첨 번호를 배정하세요. 같은 번호는 두 팀에 입력할 수 없습니다.</p>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <div className="rounded-2xl bg-surface p-5">
          <div className="flex items-center justify-between"><h2 className="font-semibold">시니어 · 참가 번호 추첨</h2><span className="text-xs text-gray-500">{Object.keys(slots).length}/8 배정</span></div>
          <div className="mt-4 space-y-2">{teams.map(team => {
            const current = Number(Object.entries(slots).find(([, t]) => t === team)?.[0] ?? '');
            return <div key={team} className="flex items-center gap-3 rounded border border-line bg-white px-3 py-2 text-sm"><span className="flex-1 font-medium">{team}</span><Dropdown value={current || null} onChange={n => setSlot(n, team)} disabledFor={n => Boolean(slots[n]) && current !== n} /></div>;
          })}</div>
          <button onClick={() => setSlots({})} className={`${btn} mt-4`}>초기화</button>
        </div>
        <div>
          <div className="flex items-center justify-between"><h2 className="font-semibold">1차 대진표 미리보기</h2><span className={complete ? 'text-xs text-accent' : 'text-xs text-gray-500'}>{complete ? '배정 완료' : '번호를 모두 배정해 주세요'}</span></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">{[1,2,3,4].map(i => <div key={i} className="rounded-xl border border-line bg-white p-4"><p className="text-xs font-semibold text-gray-500">{String.fromCharCode(64+i)}조 · 테이블 {Math.ceil(i/2)}</p><p className="mt-3 rounded-lg bg-surface px-3 py-2 text-sm">{slots[i] ?? `${i}번 팀 대기`}</p><p className="mt-2 rounded-lg bg-surface px-3 py-2 text-sm">{slots[i+4] ?? `${i+4}번 팀 대기`}</p></div>)}</div>
          <div className="mt-5 flex flex-wrap gap-2"><button disabled={!complete || applied} onClick={() => setApplied(true)} className={`${btnPrimary} disabled:opacity-40`}>{applied ? '대진표 적용 완료' : '대진표 확정 · 적용'}</button><button className={btn}>대진표 PDF</button></div>
          {applied && <p className="mt-3 rounded-xl bg-[#eaf5ff] p-3 text-sm text-[#258eed]">대진표가 확정되어 심판 담당 경기와 2차 자동 재배치에 적용됐습니다.</p>}
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
        <Stat title="참가팀" value="32" sub="주니어 16 · 시니어 16" />
        <Stat title="활성 계정" value="29" sub="최근 24시간" />
        <Stat title="미접속" value="3" sub="" />
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
    tab === 'robotApproval' ? <RobotApprovalPanel /> :
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
