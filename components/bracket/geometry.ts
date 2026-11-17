// 대진표 캔버스 기하(박스 위치·커넥터 경로). 공개 대진표와 관리자 배정 화면이 같은 좌표를 쓴다.

// 8강 토너먼트 대진표 (Figma 92:316): 캔버스 1600 x 1118
// 1열: 8팀(슬롯) → 2열: 8강 승자 4 → 3열: 준결승 승자 2 → 4열: 결승 / 3·4위전
// 관리자 편집 모드에서는 1열 박스가 팀을 끌어다 놓는 점선 슬롯이 된다.
export const BW = 256;
export const BH = 96;
export const W = 1600;
export const H = 1118;

export type Box = { x: number; y: number };

const COL = [0, 424, 864, 1344];
export const T: Box[] = [0, 158, 318, 446, 606, 734, 894, 1022].map((y) => ({ x: COL[0], y }));
// 도착 박스는 항상 출발 박스 두 개의 정확히 가운데에 두어, 화살표가 합쳐지는 지점의 정중앙을 가리키게 한다.
const between = (a: Box, b: Box, x: number): Box => ({ x, y: (a.y + b.y) / 2 });
export const QF: Box[] = [0, 1, 2, 3].map((i) => between(T[2 * i], T[2 * i + 1], COL[1]));
export const SF: Box[] = [0, 1].map((i) => between(QF[2 * i], QF[2 * i + 1], COL[2]));
export const FINAL: Box = between(SF[0], SF[1], COL[3]);
export const THIRD: Box = { x: COL[3], y: 726 };

// Figma 커넥터(엘보 + 화살표 선, 굵기 4). x 는 Figma 섹션 기준에서 (941)를 뺀 값을 그대로 쓰고,
// y 는 출발/도착 박스의 세로 중앙에 맞춘다 — 화살촉 끝이 도착 박스 정중앙을 가리키도록.
// [시작 x, 시작 y, 끝 x, 끝 y, 세로선 위치(시작점 기준)]
const OX = 941;
type Conn = [number, number, number, number, number];
const mid = (b: Box) => b.y + BH / 2;
const k = (sx: number, from: Box, ex: number, to: Box, vx?: number): Conn => {
  const sy = mid(from);
  const ey = mid(to);
  return [sx - OX, sy, ex - OX, ey, vx ?? (ey > sy ? 52.5 : 50)];
};

const SOLID_CONNS: Conn[] = [
  ...QF.flatMap((q, i) => [k(1221, T[2 * i], 1341, q), k(1221, T[2 * i + 1], 1341, q)]),
  ...SF.flatMap((s, i) => [k(1645, QF[2 * i], 1765, s), k(1645, QF[2 * i + 1], 1765, s)]),
  k(2125, SF[0], 2245, FINAL),
  k(2125, SF[1], 2245, FINAL),
];
// 준결승 패자 → 3·4위전 (파란 점선)
const DASHED_CONNS: Conn[] = [k(2101, SF[0], 2244, THIRD, 45), k(2124, SF[1], 2244, THIRD, 22)];

// 모서리가 둥근 엘보 선 + ARROW_LINES 화살표(끝점에서 45° 로 12.73 씩 벌어지는 ㅅ자)
function elbow([sx, sy, ex, ey, vx]: Conn) {
  const down = ey > sy;
  const x = sx + vx;
  const r1 = Math.min(24, vx, Math.abs(ey - sy) / 2);
  const r2 = Math.min(24, ex - x, Math.abs(ey - sy) / 2);
  const d = down ? 1 : -1;
  const A = 12.728;
  return (
    `M${sx} ${sy}H${x - r1}Q${x} ${sy} ${x} ${sy + d * r1}V${ey - d * r2}Q${x} ${ey} ${x + r2} ${ey}H${ex}` +
    `M${ex - A} ${ey - A}L${ex} ${ey}L${ex - A} ${ey + A}`
  );
}
export const SOLID = SOLID_CONNS.map(elbow).join('');
export const DASHED = DASHED_CONNS.map(elbow).join('');

export const pos = (b: Box) => ({
  left: `${(b.x / W) * 100}%`,
  top: `${(b.y / H) * 100}%`,
  width: `${(BW / W) * 100}%`,
  height: `${(BH / H) * 100}%`,
});

