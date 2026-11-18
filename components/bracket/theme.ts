import type { Category } from '@/lib/judge/rules';

// 부문별 대진표 색: 주니어 = 주황, 시니어 = 남색
export type BracketTheme = {
  main: string; // 제목·시드 태그·라벨
  border: string; // 칸 테두리
  line: string; // 커넥터
  soft: string; // 우승 칸 배경
  tint: string; // 승자 미리보기 칸 배경
};

export const BRACKET_THEME: Record<Category, BracketTheme> = {
  J: { main: '#df7a42', border: '#df7a42', line: '#df7a42', soft: '#f8e3d7', tint: '#fff7f2' },
  S: { main: '#1f3a93', border: '#a9b8ec', line: '#8fa1df', soft: '#d9e1f8', tint: '#f3f6fe' },
};
