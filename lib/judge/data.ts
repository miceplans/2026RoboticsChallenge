import type { Category } from './rules';

// TODO: 데모 데이터. 실제 참가팀·대진은 서버/관리자 연동 시 교체한다.
export type Team = { id: string; cat: Category; name: string; org: string; members: string[] };
export type Match = {
  id: string; // 서버로 보내는 matchId
  round: 1 | 2;
  cat: Category;
  wave: 'A' | 'B';
  table: number;
  field: '좌' | '우';
  team: string; // Team.id (서버로 보내는 teamId)
};

const TEAM_NAMES = ['메디봇', '세이프가드', '라이프라인', '큐어러', '헬스온', '펄스', '닥터윙', '케어링', '레스큐원', '바이탈', '힐링기어', '에이드봇', '트리아지', '모빌케어', '클린존', '하트비트', '로보메딕', '스카이힐', '메디무버', '가디언즈', '올케어', '프론트라인', '캡슐', '온콜', '리커버리', '세이버', '메디플로우', '핸즈온', '큐브힐', '패스파인더', '에코케어', '브릿지'];
const MEMBERS = ['김OO', '이OO', '박OO', '최OO', '정OO'];

export const TABLES = [1, 2, 3, 4, 5, 6, 7, 8];

export const TEAMS: Team[] = (['J', 'S'] as const).flatMap((cat, ci) =>
  Array.from({ length: 16 }, (_, i) => ({
    id: cat + String(i + 1).padStart(2, '0'),
    cat,
    name: TEAM_NAMES[ci * 16 + i],
    org: '샘플학교 ' + String.fromCharCode(65 + (i % 10)),
    members: MEMBERS.slice(0, 2 + (i % 3)),
  })),
);

// 기본 배정: 시니어는 테이블 1~4, 주니어는 5~8. 2차에는 조(A/B)를 바꾼다.
export const MATCHES: Match[] = ([1, 2] as const).flatMap((round) =>
  TEAMS.map((t) => {
    const i = Number(t.id.slice(1)) - 1;
    const first = i < 8 ? 'A' : 'B';
    const k = i % 8;
    return {
      id: `R${round}-${t.id}`,
      round,
      cat: t.cat,
      wave: round === 1 ? first : first === 'A' ? 'B' : 'A',
      table: (t.cat === 'S' ? 1 : 5) + Math.floor(k / 2),
      field: k % 2 ? '우' : '좌',
      team: t.id,
    } satisfies Match;
  }),
);

export const teamOf = (id: string) => TEAMS.find((t) => t.id === id)!;

// 순위판 표시용. 목록에 없는 ID 는 그대로 보여준다.
export const teamName = (id: string) => TEAMS.find((t) => t.id === id)?.name ?? id;
export const matchesOfTable = (table: number) => MATCHES.filter((m) => m.table === table);
