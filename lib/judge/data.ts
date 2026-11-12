import type { Category } from './rules';

// 본선 참가팀 명단. 경기 배정은 아래 MATCHES의 임시 규칙을 따른다.
export type Team = { id: string; cat: Category; code: string; name: string; region: string; org: string; coach: string; members: string[] };
export type Match = {
  id: string; // 서버로 보내는 matchId
  round: 1 | 2;
  cat: Category;
  wave: 'A' | 'B';
  table: number;
  field: '좌' | '우';
  team: string; // Team.id (서버로 보내는 teamId)
};

export const TABLES = [1, 2, 3, 4, 5, 6, 7, 8];

// 출처: 주니어/시니어 본선 명단 CSV. 각 부문 1~16번만 포함하고 예비팀은 제외한다.
// members의 첫 번째 이름은 팀장이다. 연락처와 이메일은 앱에 저장하지 않는다.
// J03 명단의 여운찬은 비고에 팀에서 제외되었다고 적혀 있어 members에서 제외했다.
export const TEAMS: Team[] = [
  { id: 'J01', cat: 'J', code: 'J-YYE-197', name: '골든타임', region: '경기', org: '고양서정초등학교', coach: '강윤심', members: ['석담희'] },
  { id: 'J02', cat: 'J', code: 'J-VOL-863', name: '김생이', region: '경기', org: '고양동산초등학교', coach: '이관희', members: ['김수겸', '김예건'] },
  { id: 'J03', cat: 'J', code: 'J-GYI-674', name: '도원챌린저스', region: '대구', org: '도원중학교', coach: '김민희', members: ['한연후', '장현우', '최민준'] },
  { id: 'J04', cat: 'J', code: 'J-ARB-743', name: '런닝맨', region: '경기', org: '수원다산중학교', coach: '박한정', members: ['김민우', '김서준'] },
  { id: 'J05', cat: 'J', code: 'J-XMO-695', name: '로동청', region: '경기', org: '연무중학교', coach: '배유진', members: ['조홍재', '김태완'] },
  { id: 'J06', cat: 'J', code: 'J-TBW-085', name: '로봇메이커스', region: '경기', org: '수원다산중학교', coach: '박한정', members: ['공상원', '박성한', '문준혁', '김경훈'] },
  { id: 'J07', cat: 'J', code: 'J-DGX-223', name: '만성', region: '전북', org: '전주만성중학교', coach: '조영훈', members: ['신주환', '김나경', '진준희', '정영진'] },
  { id: 'J08', cat: 'J', code: 'J-SZM-451', name: '별달구슬', region: '전북', org: '전주만성중학교', coach: '조영훈', members: ['문서영', '김예별', '구슬기'] },
  { id: 'J09', cat: 'J', code: 'J-SUY-830', name: '세이브온(SaveON)', region: '전북', org: '전주효천초등학교', coach: '조광복', members: ['이정후', '박이안', '서지온', '유다원', '장우현', '심이한', '김태윤', '임서준'] },
  { id: 'J10', cat: 'J', code: 'J-MFA-977', name: '조아용', region: '경기', org: '매봉초등학교', coach: '신정아', members: ['조아연'] },
  { id: 'J11', cat: 'J', code: 'J-STQ-747', name: '창의도원', region: '대구', org: '도원중학교', coach: '김민희', members: ['정시우', '김도현', '이재호'] },
  { id: 'J12', cat: 'J', code: 'J-OTI-402', name: '춘천 닭갈비', region: '강원', org: '춘천기계공업고등학교 영재학급', coach: '이성동', members: ['강연우', '김라온'] },
  { id: 'J13', cat: 'J', code: 'J-WUT-104', name: '화이트홀', region: '경기', org: '도래울중학교', coach: '최선미', members: ['김우진', '이재윤'] },
  { id: 'J14', cat: 'J', code: 'J-SVW-346', name: 'fourtatoes', region: '전북', org: '전주만성중학교', coach: '조영훈', members: ['이연후', '전수인', '이채은', '김규민'] },
  { id: 'J15', cat: 'J', code: 'J-JAR-868', name: 'joohoking', region: '경기', org: '광교중학교', coach: '박미나', members: ['김주호'] },
  { id: 'J16', cat: 'J', code: 'J-VKY-709', name: 'PHAST', region: '부산', org: '명일초등학교', coach: '배경호', members: ['손수빈'] },
  { id: 'S01', cat: 'S', code: 'S-HTZ-257', name: '가람', region: '서울', org: '송곡고등학교', coach: '장원정', members: ['이서준', '인영환', '박민기', '김예안', '편도경', '이여호수아', '김규민'] },
  { id: 'S02', cat: 'S', code: 'S-MFC-864', name: '금보틱스', region: '인천', org: '인천과학예술영재학교', coach: '진근영', members: ['류형준', '김민준', '이민재', '이희도', '조성민', '조은찬', '정한경', '황태성'] },
  { id: 'S03', cat: 'S', code: 'S-TRO-597', name: '기여하는삶', region: '경기', org: '덕양중학교', coach: '윤소은', members: ['석유안'] },
  { id: 'S04', cat: 'S', code: 'S-LBR-924', name: '로보랩', region: '경기', org: '우성고등학교', coach: '이민우', members: ['조영탁', '정찬희', '정무현', '강수민', '김동현', '임찬송'] },
  { id: 'S05', cat: 'S', code: 'S-XFP-315', name: '문태효자', region: '전남광주', org: '문태고등학교', coach: '박호림', members: ['문태영', '주윤', '박가람', '박태민', '박경미'] },
  { id: 'S06', cat: 'S', code: 'S-FRV-088', name: '비트코딩', region: '경남', org: '거창대성고등학교', coach: '황정금', members: ['박영준', '허지우', '박지함', '김민성', '김태호', '김경훈', '권성우', '여태연'] },
  { id: 'S07', cat: 'S', code: 'S-UCJ-564', name: '여 유 롭 다', region: '인천', org: '인천과학예술영재학교', coach: '진근영', members: ['김주헌', '김건호', '남세령', '김민혁', '윤동현', '김정훈', '권우진', '신재원'] },
  { id: 'S08', cat: 'S', code: 'S-TAA-856', name: '영코크', region: '강원', org: '유봉여자고등학교', coach: '이성호', members: ['박주희', '김래현', '오정민', '최지윤', '서지효'] },
  { id: 'S09', cat: 'S', code: 'S-KXS-326', name: '인하로보_2팀', region: '인천', org: '인하대학교사범대학부속중학교', coach: '김형기', members: ['서승오', '김이준', '최윤혁'] },
  { id: 'S10', cat: 'S', code: 'S-UTV-076', name: '인하로보_3팀', region: '인천', org: '인하대학교사범대학부속중학교', coach: '김형기', members: ['김수현', '김택현', '한동현', '박민찬'] },
  { id: 'S11', cat: 'S', code: 'S-MBZ-962', name: '지환석희', region: '경기', org: '광교중학교', coach: '손화진', members: ['이지환', '고석희'] },
  { id: 'S12', cat: 'S', code: 'S-GVH-148', name: '춘천과 원주', region: '강원', org: '춘천기계공업고등학교 영재학급', coach: '이성동', members: ['이민수', '이도형'] },
  { id: 'S13', cat: 'S', code: 'S-YIM-887', name: '파고파고', region: '경기', org: '신갈고등학교', coach: '강소희', members: ['황규원', '구아현', '엄유진', '최인혜'] },
  { id: 'S14', cat: 'S', code: 'S-ERL-225', name: 'ds77win', region: '경남', org: '거창대성고등학교', coach: '조유찬', members: ['손준서', '김민준', '배진우', '박천이', '신재형', '위상진', '장우석'] },
  { id: 'S15', cat: 'S', code: 'S-ELC-341', name: 'Nonamed', region: '대전', org: '대덕소프트웨어마이스터고등학교', coach: '박아영', members: ['이다연', '염세현'] },
  { id: 'S16', cat: 'S', code: 'S-FPK-721', name: 'pivot', region: '경기', org: '우성고등학교', coach: '이민우', members: ['김수진', '장동원', '임세환', '소아연', '노유찬', '최어진'] },
];

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
