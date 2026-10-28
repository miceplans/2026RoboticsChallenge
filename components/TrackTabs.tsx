'use client';

import { useEffect, useState } from 'react';

type Row = { label: string; body: React.ReactNode };
type Track = {
  id: string;
  chip: string;
  title: string;
  lead?: string;
  apply: { label: string; href: string };
  note: string;
  rows: Row[];
  file: { label: string; href: string };
};

const Sub = ({ children }: { children: React.ReactNode }) => (
  <span className="block mt-0.5 text-gray-500">{children}</span>
);

const List = ({ items }: { items: string[] }) => (
  <ul className="mt-1 space-y-0.5">
    {items.map((i) => (
      <li key={i}>- {i}</li>
    ))}
  </ul>
);

const tracks: Track[] = [
  {
    id: 'a',
    chip: '로보틱스 문제해결',
    title: '로보틱스 문제해결',
    apply: {
      label: '문제해결 예선 신청 바로가기',
      href: 'https://apply.kosac.re.kr/onlnRcpt/getBscInfo.do?pbancNo=2026-S729',
    },
    note: '※ 문제해결 트랙의 세부 운영사항은 하단 첨부파일의 ‘2026 로보틱스 챌린지 문제해결 트랙 안내.pdf’ 문서를 참고 바랍니다.',
    rows: [
      {
        label: '대회주제',
        body: (
          <>
            Health Emergencies - 보건 위기
            <Sub>※ ‘2026-2027 Robotics for good Youth Challenge(국제대회)’ 주제와 연동하여 추진</Sub>
          </>
        ),
      },
      {
        label: '대회일정',
        body: (
          <>
            <List
              items={[
                '예선대회 참가신청(예선키트 발송) : 8.26.(수) ~ 9.7.(월) 23:59',
                '예선대회 영상 접수 : ~ 9.29.(화) 18:00',
                '본선 발표 : 10.8.(목)',
                '본선 대회 : 11.21(토)',
              ]}
            />
            <Sub>※ 행사 운영 등 세부 추진 일정은 일부 변경될 수 있습니다.</Sub>
          </>
        ),
      },
      { label: '접수방법', body: '한국과학창의재단 온라인 접수 시스템' },
      {
        label: '참가자격',
        body: (
          <>
            참여 가능 기관* 소속 청소년 (기관 단위로 신청, 팀당 1∼8인으로 구성)
            <List items={['Junior : 2013~2017년생', 'Senior : 2009~2012년생']} />
            <Sub>※ 참여 가능 기관(학교 등)은 하단 안내문을 참고</Sub>
          </>
        ),
      },
      {
        label: '특전',
        body: '주니어 및 시니어 최우수상 각 1팀에 대해서 ‘2026-2027 Robotics for good Youth Challenge(‘27. 6월, 스위스 제네바)’ 국제대회에 한국 대표 출전 지원 예정',
      },
    ],
    file: {
      label: '2026 로보틱스 챌린지 문제해결 트랙 안내.pdf',
      href: 'https://file.aichallenge4all.or.kr/ai-robot/1787814911114_2026_로보틱스_챌린지_문제해결_트랙_안내.pdf',
    },
  },
  {
    id: 'c',
    chip: '2026 로보틱스 작품공모전',
    title: '2026 로보틱스 작품공모전',
    lead: '로보틱스와 AI를 활용한 예술, 사회, 과학, 문화, 교육 등 다양한 주제의 작품 출품',
    apply: {
      label: '2026 로보틱스 작품공모전 신청 바로가기',
      href: 'https://apply.kosac.re.kr/onlnRcpt/getBscInfo.do?pbancNo=2026-S747',
    },
    note: '※ 세부 운영사항은 하단 첨부파일의 ‘2026 로보틱스 작품공모전 참가자(팀) 모집.pdf’ 문서를 참고 바랍니다.',
    rows: [
      {
        label: '대회주제',
        body: (
          <>
            Beyond boundaries, living with robots - 인간과 로봇의 공존
            <Sub>※ 로봇공학과 예술·인문·사회 등 다양한 분야를 융합하여 ‘인간과 로봇의 공존’을 표현한 작품을 갤러리형으로 전시·시연</Sub>
          </>
        ),
      },
      {
        label: '대회일정',
        body: (
          <>
            <List
              items={[
                '참가신청 및 서류접수 : 10.8.(목) ~ 11.2.(월) 18:00',
                '서류·동영상 심사 : 11.4.(수) ~ 11.10.(화)',
                '본선 발표 : 11.12.(목)',
                '멘토링·고도화 : 11.13.(금) ~ 11.25.(수)',
                '본선 대회 : 11.28.(토)',
              ]}
            />
            <Sub>※ 행사 운영 등 세부 추진 일정은 일부 변경될 수 있습니다.</Sub>
          </>
        ),
      },
      {
        label: '접수방법',
        body: (
          <>
            한국과학창의재단 온라인접수시스템(
            <a href="https://apply.kosac.re.kr/" target="_blank" rel="noopener noreferrer" className="text-accent break-all">
              https://apply.kosac.re.kr/
            </a>
            )
          </>
        ),
      },
      {
        label: '참가자격',
        body: '직접 정비·운용이 가능한 로봇을 보유한 개인 또는 팀 (분야·계층 제한 없음, 팀당 팀장 포함 최대 10인으로 구성)',
      },
    ],
    file: {
      label: '2026 로보틱스 작품공모전 참가자(팀) 모집 안내문.pdf',
      href: 'https://file.aichallenge4all.or.kr/ai-robot/1792031857844_2026_로보틱스_작품공모전_참가자_팀__모집_안내문.pdf',
    },
  },
];

export default function TrackTabs() {
  const [active, setActive] = useState(tracks[0].id);

  useEffect(() => {
    const sync = () => {
      const id = window.location.hash.slice(1);
      if (tracks.some((t) => t.id === id)) setActive(id);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const select = (id: string) => {
    setActive(id);
    history.replaceState(null, '', `#${id}`);
  };

  return (
    <section className="max-w-[1280px] mx-auto px-6 pb-16">
      <div role="tablist" aria-label="참가 트랙" className="flex flex-wrap gap-2 mb-8">
        {tracks.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={on}
              aria-controls={`panel-${t.id}`}
              onClick={() => select(t.id)}
              className={`h-10 px-4 rounded-full text-[17px] font-semibold transition-colors cursor-pointer ${
                on
                  ? 'bg-accent-soft text-white'
                  : 'bg-white border border-line text-gray-500 hover:border-line-hover'
              }`}
            >
              {t.chip}
            </button>
          );
        })}
      </div>

      {tracks.map((t) => (
        <article
          key={t.id}
          role="tabpanel"
          id={`panel-${t.id}`}
          aria-labelledby={`tab-${t.id}`}
          hidden={t.id !== active}
          className="text-gray-700 [word-break:keep-all]"
        >
          <h2 className="text-3xl font-extrabold text-heading mb-3 [word-break:keep-all]">{t.title}</h2>
          {t.lead && <p className="mb-4 text-[15px] lg:text-base">{t.lead}</p>}
          <a
            href={t.apply.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center rounded-2xl bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-soft transition-colors"
          >
            {t.apply.label}
          </a>
          <p className="mt-3 mb-4 text-sm text-gray-500">{t.note}</p>
          <dl className="space-y-3 text-sm lg:text-base leading-relaxed">
            {t.rows.map((r) => (
              <div key={r.label}>
                <dt className="font-bold text-gray-800">{r.label}</dt>
                <dd className="mt-0.5">{r.body}</dd>
              </div>
            ))}
          </dl>
          <h3 className="mt-8 mb-3 text-base font-bold text-gray-900">첨부파일</h3>
          <a
            href={t.file.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center rounded-2xl border border-line bg-white px-4 text-sm font-medium text-heading hover:border-line-hover transition-colors"
          >
            {t.file.label}
          </a>
        </article>
      ))}
    </section>
  );
}
