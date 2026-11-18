// 대진표 캔버스 기하(박스 위치·커넥터 경로). 공개 대진표와 관리자 배정 화면이 같은 좌표를 쓴다.

// 대진표(8강 ~ 결승) 시안 형식: 캔버스 560 x 680
// 1열: 시드 태그(1위·8위 …) + 8팀 → 2열(4강): 8강 승자 4 → 3열(결승): 준결승 승자 2, 가운데 우승 칸
// 아래: 3·4위전(준결승 패자 2) + 3위·4위 표시
// 관리자 편집 모드에서는 1열 박스가 팀을 끌어다 놓는 점선 슬롯이 된다.
export const W = 560;
export const H = 680;

export type Box = { x: number; y: number; w: number; h: number };

const BH = 38;
const TAG_W = 55;
const TEAM_W = 118;
const COL_W = 141;
const COL = [0, 212, 392];

export const TITLE: Box = { x: 0, y: 0, w: 230, h: 42 };
const HEAD_Y = 52;
export const HEADS: { label: string; cx: number; y: number }[] = [
  { label: '8강', cx: (TAG_W + TEAM_W) / 2, y: HEAD_Y },
  { label: '4강', cx: COL[1] + COL_W / 2, y: HEAD_Y },
  { label: '결승', cx: COL[2] + COL_W / 2, y: HEAD_Y },
];

// 1열 팀 박스(시드 태그 오른쪽). 두 칸씩 붙어 한 경기를 이룬다.
const TEAM_Y = [77, 119, 197, 239, 317, 359, 437, 479];
export const T: Box[] = TEAM_Y.map((y) => ({ x: TAG_W, y, w: TEAM_W, h: BH }));
export const TAGS: Box[] = TEAM_Y.map((y) => ({ x: 0, y, w: TAG_W, h: BH }));

const mid = (b: Box) => b.y + b.h / 2;
// 도착 박스는 출발 박스 두 개의 정확히 가운데에 둔다.
const between = (a: Box, b: Box, x: number): Box => ({ x, y: (mid(a) + mid(b)) / 2 - BH / 2, w: COL_W, h: BH });
export const QF: Box[] = [0, 1, 2, 3].map((i) => between(T[2 * i], T[2 * i + 1], COL[1]));
export const SF: Box[] = [0, 1].map((i) => between(QF[2 * i], QF[2 * i + 1], COL[2]));
// 우승 칸: 결승 두 칸 사이 가운데
export const FINAL: Box = { x: COL[2], y: (mid(SF[0]) + mid(SF[1])) / 2 - 31, w: COL_W, h: 62 };
// 3·4위전: 준결승 패자 두 칸 + 오른쪽에 3위·4위
export const THIRD_LABEL_Y = 537;
export const THIRD: Box[] = [555, 597].map((y) => ({ x: COL[1], y, w: COL_W, h: BH }));
export const PLACES: { label: string; x: number; y: number }[] = [
  { label: '3위', x: COL[1] + COL_W + 23, y: 568 },
  { label: '4위', x: COL[1] + COL_W + 23, y: 601 },
];

// ㄷ자 커넥터: 두 출발 박스 오른쪽에서 나와 세로로 합쳐진 뒤 도착 박스 왼쪽 가운데로 들어간다.
const join = (a: Box, b: Box, to?: Box) => {
  const sx = a.x + a.w;
  const vx = to ? (sx + to.x) / 2 : sx + 15;
  const path = `M${sx} ${mid(a)}H${vx}V${mid(b)}H${sx}`;
  return to ? `${path}M${vx} ${mid(to)}H${to.x}` : path;
};

export const LINES = [
  ...QF.map((q, i) => join(T[2 * i], T[2 * i + 1], q)),
  ...SF.map((s, i) => join(QF[2 * i], QF[2 * i + 1], s)),
  join(SF[0], SF[1]),
].join('');

export const pos = (b: Box) => ({
  left: `${(b.x / W) * 100}%`,
  top: `${(b.y / H) * 100}%`,
  width: `${(b.w / W) * 100}%`,
  height: `${(b.h / H) * 100}%`,
});
