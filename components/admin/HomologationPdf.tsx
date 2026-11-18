'use client';

import { forwardRef, type CSSProperties, type ReactNode } from 'react';
import type { Team } from '@/lib/contest';
import { CATEGORY_LABEL, homologationStatus, robotApproved, robotIndexes, robotList, robotRange, staticPassed, type HomologationData, type RobotCheck } from '@/lib/homologation';

// 로봇승인서_Homologation_Sheet_한국어.pptx (A4 세로 2쪽)를 그대로 옮긴 PDF 양식.
// 좌표(px, 794 × 1123)·글자 크기·문구는 원본 슬라이드의 도형 값을 그대로 쓴다 (그룹 변환 적용, 텍스트 상자 안쪽 여백 5.7px).
// 각 블록은 원본에서 다음 블록까지의 간격만큼 높이를 차지해서, 로봇 4대일 때 원본과 같은 자리에 놓인다.
// 로봇이 많아 R 줄이 길어지면 그 블록만 늘어나고 아래가 밀린다.

const FONT = '"Pretendard PDF", Pretendard, -apple-system, "Noto Sans KR", sans-serif';
const INK = '#222222';
const GRAY = '#EDEDED';
const INSET = 5.7; // 텍스트 상자 안쪽 여백 (54000 EMU)
const PAD = 13.2; // 회색 상자 좌우 여백 (126000 EMU)
const LINE = 14 * 1.2; // 본문 한 줄 높이

// 원본 글꼴(Pretendard)을 PDF 캡처 때만 받아 쓴다
const FONT_CSS = `
@font-face { font-family: "Pretendard PDF"; font-weight: 400; font-display: block; src: url("https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/static/woff2/Pretendard-Regular.woff2") format("woff2"); }
@font-face { font-family: "Pretendard PDF"; font-weight: 700; font-display: block; src: url("https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/static/woff2/Pretendard-Bold.woff2") format("woff2"); }
`;

export async function loadHomologationFonts() {
  try {
    await Promise.all([document.fonts.load('400 14px "Pretendard PDF"', '가A'), document.fonts.load('700 14px "Pretendard PDF"', '가A')]);
  } catch {
    // 글꼴을 못 받아도 대체 글꼴로 출력한다
  }
}

type Props = { team: Team; data: HomologationData; mode?: 'capture' | 'inline' };

export const HomologationPdf = forwardRef<HTMLDivElement, Props>(function HomologationPdf({ team, data, mode = 'capture' }, ref) {
  const n = data.robots;
  const robots = robotIndexes(data);
  const all = (key: RobotCheck) => robots.every((i) => data.checks[key][i]);
  const by = (key: RobotCheck) => (i: number) => data.checks[key][i];
  const passedStatic = robots.filter((i) => staticPassed(data, i));
  const approved = robots.filter((i) => robotApproved(data, i));
  const teamPass = homologationStatus(data) === 'pass';

  return (
    <div aria-hidden={mode === 'capture'} className={mode === 'capture' ? 'pointer-events-none fixed left-[-10000px] top-0' : ''}>
      <style>{FONT_CSS}</style>
      <div ref={ref} className="flex flex-col gap-4">
        {/* ---------- 1쪽 ---------- */}
        <Page no={1} start={83.1}>
          <Block y={83.1} next={124.7} x={60.5} w={672.8} pad>
            <p style={{ fontSize: 21.33, fontWeight: 700 }}>로봇 승인서 (Homologation Sheet)</p>
          </Block>
          <Block y={124.7} next={177.6} x={60.5} w={672.8}>
            <div style={{ display: 'flex', gap: 402.5 - 60.5 - 330.7 }}>
              <Field w={330.7} h={45.4} label="부문 (주니어 / 시니어):" value={CATEGORY_LABEL[team.cat]} />
              <Field w={330.7} h={45.4} label="제출 로봇 수:" value={`${n}`} note={`(${robotList(n)}로 표시)`} />
            </div>
          </Block>
          <Block y={177.6} next={223.0} x={60.5} w={672.8}>
            <Field w={672.8} h={37.8} label="팀명:" value={team.name} />
          </Block>
          <Block y={223.0} next={279.7} x={60.5} w={672.8}>
            <Field w={672.8} h={37.8} label="심판 / 심사위원:" value={data.judge} />
          </Block>

          <Heading y={279.7} next={318.8}>A) 사전 식별 (필수)</Heading>
          <Item y={318.8} next={354.4} on={all('label')} text={`**로봇 라벨링: **시작 전에 모든 로봇에 스티커나 마커로 **${robotList(n)}**를 분명하게 표시해야 합니다.`} />
          <Row y={354.4} next={396.0} n={n} on={by('label')} prefix="라벨 확인:" />
          <Block y={396.0} next={483.3} x={75.6} w={642.5}>
            <Panel h={56.2} r={6.7} size={13.33}>
              <Rich text={`**라벨 변경 금지: **로봇에 붙인 번호(${robotRange(n)})는 대회 당일 내내 바꿀 수 없습니다.`} />
            </Panel>
          </Block>

          <Heading y={483.3} next={528.8}>B) 정적 검사 (로봇을 멈춘 상태에서)</Heading>
          <Item y={528.8} next={555.2} on={data.decoration === 'yes'} text="**로봇 장식: **모든 로봇에 챌린지 주제와 관련된 장식 요소가 있어야 합니다." />
          <Block y={555.2} next={596.9} x={60.5} w={672.8} pad>
            <p style={{ textAlign: 'center', whiteSpace: 'pre' }}>
              예 <Box on={data.decoration === 'yes'} />{'     '}아니오 <Box on={data.decoration === 'no'} />
            </p>
          </Block>
          <Item y={596.9} next={638.4} on={all('startZone')} text="**로봇과 시작 구역** (로봇 여러 대 허용): 모든 로봇과 부속품이 시작 구역 안에 **완전히 들어가야** 합니다. **선에 닿는 것은 괜찮지만 넘어가면 안 됩니다.**" />
          <Row y={638.4} next={680.1} n={n} on={by('startZone')} />
          <Item y={680.1} next={706.5} on={all('startMethod')} text="**명확한 시작 방식: 쉽게 조작할 수 있는** 단일 시작 장치 (버튼, 스위치 또는 짧은 조작 순서)." />
          <Row y={706.5} next={748.2} n={n} on={by('startMethod')} />
          <Item y={748.2} next={774.6} on={all('autonomous')} text="**자율 작동 신고: 사람의 조종 없이 작동**해야 합니다 (리모컨·원격 조작 금지)." />
          <Row y={774.6} next={816.3} n={n} on={by('autonomous')} />
          <Item y={816.3} next={857.9} on={all('safety')} text="**안전성·완성도: 자르거나 찌르는 부분**·날카로운 모서리 없음, **풀린 부품**(나사·전선) 없음, **배터리는 단단히 고정**.    경기장을 **손상시키면 안 됩니다**." />
          <Row y={857.9} next={899.5} n={n} on={by('safety')} />
          <Item y={899.5} next={926.0} on={all('estop')} text="**비상 정지: **비상 정지 장치가 있고, 알아보기 쉽고, 손이 닿는 곳에 있어야 합니다." />
          <Row y={926.0} next={992.1} n={n} on={by('estop')} />
          <Block y={992.1} next={1086.6} x={64.3} w={642.5}>
            <Panel h={94.5} r={11.3} size={13.33}>
              <Rich text="**합격 기준(정적 상태): **모든 항목을 충족한 로봇은 승인되어 동적 검사로 넘어갑니다." />
              <br />
              하나라도 충족하지 못한 로봇은 실격이며 대회에서 사용할 수 없습니다.
            </Panel>
          </Block>
        </Page>

        {/* ---------- 2쪽 ---------- */}
        <Page no={2} start={94.5}>
          <Heading y={94.5} next={134.8}>C) 동적 검사 (짧은 시연)</Heading>
          <Item
            y={134.8}
            next={176.3}
            on={all('dynStart')}
            text={'**시작 및 시작 구역 이탈: **시작 구역 안에서 신고한 장치로 **한 번만 조작**해 출발하고, 추가 조작이나 외부 도움 없이\n**    스스로** 시작 구역을 벗어나야 합니다.'}
          />
          <Row y={176.3} next={217.4} n={n} on={by('dynStart')} />
          <Item y={217.4} next={270.0} on={all('dynSafe')} text="**안전하고 통제된 움직임: **경기판이나 소품을 손상시키지 않고, 경기장 밖으로 나가지 않아야 합니다. 로봇이    여러대면 서로 위험하게 부딪히거나 일부러 방해하지 않아야 합니다." />
          <Row y={270.0} next={304.8} n={n} on={by('dynSafe')} />

          <Heading y={304.8} next={334.1}>검사 판정</Heading>
          <Item y={334.1} next={360.5} on={passedStatic.length > 0} text="정적 검사를 통과한 로봇" />
          <Row y={360.5} next={385.8} n={n} on={(i) => passedStatic.includes(i)} />
          <Item y={385.8} next={412.3} on={approved.length > 0} text="출전이 승인된 로봇" />
          <Row y={412.3} next={454.4} n={n} on={(i) => approved.includes(i)} />
          <Item y={454.4} next={533.9} on={teamPass} text="**팀 승인 기준: **검사에서 탈락하거나 승인받지 못한 로봇은 **그 로봇만** 대회에서 쓸 수 없습니다. 정적·동적 검사를 모두        통과한 로봇이 **1대 이상** 있으면, 팀은 나머지 승인 로봇으로 출전할 수 있습니다." />

          {/* 팀 최종 결과 (회색 상자 533.9 ~ 755.4, 안의 블록은 상자 기준으로 놓는다) */}
          <Block y={533.9} next={855.1} x={62.3} w={669.0}>
            <div style={{ minHeight: 221.5, background: GRAY, borderRadius: 10.5, paddingTop: 544.4 - 533.9, display: 'flex', flexDirection: 'column' }}>
              <Heading y={544.4} next={574.6} x={75.6 - 62.3} w={628.4} inBox>팀 최종 결과</Heading>
              <Item y={574.6} next={613.4} x={75.6 - 62.3} on={teamPass} text="**출전 가능: **승인된 로봇이 1대 이상 있음" inBox />
              <Row y={613.4} next={643.6} x={0} w={669.0} n={n} on={(i) => approved.includes(i)} prefix="출전 가능 로봇:" inBox />
              <Row y={643.6} next={684.6} x={0} w={669.0} n={n} on={(i) => !approved.includes(i)} prefix="출전 불가 로봇:" inBox />
              <Item y={684.6} next={711.1} x={75.6 - 62.3} on={!teamPass} text="**출전 불가: **제출한 로봇 중 출전 승인을 받은 로봇이 한 대도 없음" inBox />
            </div>
          </Block>

          <Block y={855.1} next={1057.3} x={62.3} w={669.3}>
            <div style={{ display: 'flex', gap: 399.8 - 62.3 - 331.5 }}>
              <SignBox label="심판 / 심사위원 서명" img={data.judgeSig} />
              <SignBox label="확인 및 동의 (팀 대표)" img={data.teamSig} />
            </div>
          </Block>
        </Page>
      </div>
    </div>
  );
});

function Page({ no, start, children }: { no: number; start: number; children: ReactNode }) {
  return (
    <div
      data-homologation-page
      className="relative flex flex-col bg-white"
      style={{ width: 794, minHeight: 1123, fontFamily: FONT, color: INK, fontSize: 14, lineHeight: 1.2, wordBreak: 'keep-all' }}
    >
      {/* 머리말: 대회명(37.8) · 구분선(71.8, 1.5pt) · AI for Good 로고(610.7, 18.4) */}
      <p style={{ position: 'absolute', left: 60.5 + INSET, top: 37.8 + INSET, fontSize: 17.33, fontWeight: 700, whiteSpace: 'nowrap' }}>
        Robotics for Good Youth Challenge 2026–2027
      </p>
      <div style={{ position: 'absolute', left: 60.5, top: 71.8 - 1, width: 672.8, height: 2, background: INK }} />
      <img src="/images/homologation-logo.png" alt="AI for Good" style={{ position: 'absolute', left: 610.7, top: 18.4, width: 122.5, height: 38.8 }} />
      {/* 첫 블록의 원본 top 까지 띄운다 — 이후 블록은 각자 다음 블록까지의 간격만큼 차지한다 */}
      <div style={{ height: start, flexShrink: 0 }} />
      {children}
      <p style={{ position: 'absolute', right: 794 - 733.2 + INSET, bottom: 1123 - 1073.4 - INSET - 12.8, fontSize: 10.67, color: '#555555' }}>{no}</p>
    </div>
  );
}

// 원본 도형 하나. y = 원본 top, next = 다음 도형의 top. 내용이 길면 늘어난다.
function Block({
  y,
  next,
  x = 75.6,
  w = 657.6,
  pad,
  inBox,
  keepGap,
  children,
}: {
  y: number;
  next: number;
  x?: number;
  w?: number;
  pad?: boolean;
  inBox?: boolean;
  keepGap?: boolean; // 한 줄일 때는 원본 간격 그대로, 줄이 늘면 그만큼 더 차지한다 (R 줄)
  children: ReactNode;
}) {
  return (
    <div
      data-y={inBox ? undefined : y}
      style={{
        marginLeft: x,
        width: w,
        minHeight: keepGap ? undefined : next - y,
        paddingBottom: keepGap ? next - y - INSET - LINE : undefined,
        paddingTop: pad ? INSET : undefined,
        paddingLeft: pad ? INSET : undefined,
        paddingRight: pad ? INSET : undefined,
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}

function Heading({ y, next, x = 60.5, w = 672.8, inBox, children }: { y: number; next: number; x?: number; w?: number; inBox?: boolean; children: ReactNode }) {
  return (
    <Block y={y} next={next} x={x} w={w} pad inBox={inBox}>
      <p style={{ fontSize: 16.67, fontWeight: 700, color: '#333333' }}>{children}</p>
    </Block>
  );
}

// "☐ 굵은 제목: 설명" 한 항목 (줄바꿈·여러 칸 띄어쓰기는 원본 그대로 둔다)
function Item({ y, next, x = 75.6, on, text, inBox }: { y: number; next: number; x?: number; on: boolean; text: string; inBox?: boolean }) {
  return (
    <Block y={y} next={next} x={x} w={657.6} pad inBox={inBox}>
      <p style={{ whiteSpace: 'pre-wrap' }}>
        <Box on={on} /> <Rich text={text} />
      </p>
    </Block>
  );
}

// "R1 ☐    R2 ☐    R3 ☐    R4 ☐" — 로봇 수만큼, 한 줄을 넘으면 가운데 정렬로 줄바꿈
function Row({ y, next, x = 60.5, w = 672.8, n, on, prefix, inBox }: { y: number; next: number; x?: number; w?: number; n: number; on: (i: number) => boolean; prefix?: string; inBox?: boolean }) {
  return (
    <Block y={y} next={next} x={x} w={w} pad inBox={inBox} keepGap>
      <p style={{ textAlign: 'center' }}>
        {prefix && <span style={{ whiteSpace: 'pre' }}>{prefix}{'  '}</span>}
        {Array.from({ length: n }, (_, i) => (
          <span key={i}>
            {i > 0 && '    '}
            <span style={{ whiteSpace: 'nowrap' }}>
              R{i + 1} <Box on={on(i)} />
            </span>
          </span>
        ))}
      </p>
    </Block>
  );
}

function Field({ w, h, label, value, note }: { w: number; h: number; label: string; value?: string; note?: string }) {
  return (
    <div style={{ width: w, minHeight: h, background: GRAY, borderRadius: Math.min(w, h) * 0.12, padding: `${INSET}px ${PAD}px` }}>
      <p style={{ fontSize: 12, color: '#555555' }}>
        {label}
        {value ? <span style={{ marginLeft: 6, fontSize: 14, color: INK }}>{value}</span> : null}
      </p>
      {note && <p style={{ fontSize: 10, color: '#555555' }}>{note}</p>}
    </div>
  );
}

function Panel({ h, r, size, children }: { h: number; r: number; size: number; children: ReactNode }) {
  return (
    <div className="flex items-center justify-center text-center" style={{ minHeight: h, background: GRAY, borderRadius: r, padding: `${INSET}px ${PAD}px`, fontSize: size }}>
      <p>{children}</p>
    </div>
  );
}

function SignBox({ label, img }: { label: string; img?: string | null }) {
  const style: CSSProperties = { width: 331.5, height: 202.2, background: GRAY, borderRadius: 9.6, position: 'relative' };
  return (
    <div style={style}>
      <p style={{ position: 'absolute', left: 6 + INSET, top: 6.1 + INSET, fontSize: 12.67 }}>{label}</p>
      {img && (
        <div className="absolute flex items-center justify-center" style={{ left: 12, right: 12, top: 34, bottom: 12 }}>
          <img src={img} alt={label} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        </div>
      )}
    </div>
  );
}

// ☐ — 체크하면 같은 상자 안에 ✓ 를 그린다 (☑). 글꼴마다 모양이 달라지지 않게 직접 그린다.
function Box({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 10 10" width={8.7} height={8.7} style={{ display: 'inline-block', verticalAlign: 0 }} aria-label={on ? '체크됨' : '빈칸'}>
      <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke={INK} strokeWidth="0.9" />
      {on && <path d="M2 5.2l2 2.1L8.2 2.6" fill="none" stroke={INK} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

// **굵게** 표시 (원본의 굵은 글씨 구간)
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split('**').map((part, i) => (i % 2 ? <b key={i} style={{ fontWeight: 700 }}>{part}</b> : <span key={i}>{part}</span>))}
    </>
  );
}

export function homologationPages(root: HTMLElement | null): HTMLDivElement[] {
  return root ? [...root.querySelectorAll<HTMLDivElement>('[data-homologation-page]')] : [];
}
