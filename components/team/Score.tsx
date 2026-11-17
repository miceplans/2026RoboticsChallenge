// 점수 한 값. 없으면 –, 있으면 숫자 + 단위. 모든 화면의 점수 표기를 이 컴포넌트로 통일한다.
export default function Score({ value, unit = '점', className = '' }: { value?: number | string | null; unit?: string; className?: string }) {
  return <span className={`tabular-nums ${className}`}>{value === undefined || value === null || value === '' ? '–' : `${value}${unit}`}</span>;
}
