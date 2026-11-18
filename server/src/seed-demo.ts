// 로컬 화면 확인용 데모 데이터. 운영/개발 DB(contest.db)에는 절대 쓰지 않는다 — DB_PATH 를 따로 지정해야 돈다.
//   DB_PATH=demo.db node src/seed-demo.ts
// 기본 명단(32팀) + 1·2차 확정 점수 + 토너먼트(주니어 결승·3·4위전까지, 시니어 준결승 1경기까지)를 채운다.
const path = process.env.DB_PATH ?? '';
if (!path || /(^|\/)contest\.db$/.test(path)) {
  console.error('DB_PATH 를 데모 전용 파일로 지정하세요. 예: DB_PATH=demo.db node src/seed-demo.ts');
  process.exit(1);
}

const { db } = await import('./db/connection.ts');
const { seedIfEmpty, getStandings } = await import('./db.ts');
const { saveTournamentSlots, saveTournamentResult } = await import('./tournament.ts');

seedIfEmpty();

const JUDGE = 'DEMO_JUDGE';
db.prepare(`INSERT OR IGNORE INTO users (id, name, role, salt, hash, must_change, created_at) VALUES (?, '데모 심판', 'judge', '-', '-', 0, ?)`).run(JUDGE, Date.now());

// 팀마다 1·2차 점수(확정). 매번 같은 결과가 나오도록 고정 난수를 쓴다.
let seed = 20261118;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const matches = db.prepare('SELECT id, team_id AS teamId FROM matches').all() as { id: string; teamId: string }[];
const insScore = db.prepare(`INSERT OR REPLACE INTO scores (match_id, team_id, judge_id, points, ts, status, pen_cnt, confirmed_at, confirmed_by)
  VALUES (?, ?, ?, ?, ?, 'confirmed', ?, ?, ?)`);
const now = Date.now();
for (const m of matches) insScore.run(m.id, m.teamId, JUDGE, 60 + Math.round(rand() * 120), now, Math.floor(rand() * 3), now, JUDGE);

// 상위 8팀을 표준 시드(1v8, 4v5 / 2v7, 3v6)로 배정
const SEED_ORDER = [1, 8, 4, 5, 2, 7, 3, 6];
const standings = getStandings();
for (const cat of ['J', 'S'] as const) {
  const top = standings.filter((s) => s.cat === cat).slice(0, 8).map((s) => s.teamId);
  saveTournamentSlots(cat, SEED_ORDER.map((n) => top[n - 1] ?? null));
}

// [라운드, 경기, A 점수, B 점수]
const J: [string, number, number, number][] = [
  ['QF', 1, 152, 98], ['QF', 2, 110, 124], ['QF', 3, 140, 131], ['QF', 4, 87, 119],
  ['SF', 1, 133, 128], ['SF', 2, 101, 145], ['F', 1, 160, 151], ['3P', 1, 122, 117],
];
const S: [string, number, number, number][] = [
  ['QF', 1, 171, 120], ['QF', 2, 95, 138], ['QF', 3, 150, 149], ['QF', 4, 112, 126], ['SF', 1, 144, 139],
];
for (const [cat, list] of [['J', J], ['S', S]] as const) {
  for (const [round, no, a, b] of list) saveTournamentResult(cat, round as 'QF' | 'SF' | 'F' | '3P', no, a, b);
}

console.log(`데모 데이터 완료: ${path} (팀 ${standings.length}, 점수 ${matches.length}건, 토너먼트 J 완료 · S 준결승 진행 중)`);
