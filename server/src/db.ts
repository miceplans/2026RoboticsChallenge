import { DatabaseSync } from 'node:sqlite';

export type ScoreInput = {
  matchId: string;
  teamId: string;
  judgeId: string;
  points: number;
  ts: number;
  sheet: string | null; // 채점지 전체(JSON 문자열). 점수만 보내는 경우 null
};
export type Standing = { teamId: string; total: number };
export type TeamScore = { matchId: string; judgeId: string; points: number; ts: number };

const db = new DatabaseSync(process.env.DB_PATH ?? 'scores.db');
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS scores (
    match_id TEXT NOT NULL,
    team_id  TEXT NOT NULL,
    judge_id TEXT NOT NULL,
    points   REAL NOT NULL,
    ts       INTEGER NOT NULL,
    sheet    TEXT,
    PRIMARY KEY (match_id, team_id, judge_id)
  );
`);
// sheet 컬럼이 생기기 전에 만든 DB 를 그대로 쓸 수 있게 한다
if (!(db.prepare('PRAGMA table_info(scores)').all() as { name: string }[]).some((c) => c.name === 'sheet')) {
  db.exec('ALTER TABLE scores ADD COLUMN sheet TEXT');
}

// 같은 (경기, 팀, 심판)은 한 행. 재전송/순서 뒤바뀜이 있어도 ts 가 더 최신일 때만 덮어쓴다.
const upsert = db.prepare(`
  INSERT INTO scores (match_id, team_id, judge_id, points, ts, sheet)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT (match_id, team_id, judge_id) DO UPDATE
    SET points = excluded.points, ts = excluded.ts, sheet = excluded.sheet
    WHERE excluded.ts > scores.ts
`);

// 순위: 팀의 1·2차 중 최고점 → 동점이면 조별 합계 → 팀 ID (대회 규정: 최고점 → 조별 합계 → 감점 적은 순)
const standings = db.prepare(`
  SELECT team_id AS teamId, MAX(points) AS total
  FROM scores GROUP BY team_id
  ORDER BY total DESC, SUM(points) DESC, team_id
`);

// 한 팀의 채점 표(심판별 점수). 채점지 원본(sheet)은 포함하지 않는다.
const teamScores = db.prepare(`
  SELECT match_id AS matchId, judge_id AS judgeId, points, ts
  FROM scores WHERE team_id = ? ORDER BY match_id, judge_id
`);

export const saveScore = (s: ScoreInput) => upsert.run(s.matchId, s.teamId, s.judgeId, s.points, s.ts, s.sheet);
export const getStandings = () => standings.all() as Standing[];
export const getTeamScores = (teamId: string) => teamScores.all(teamId) as TeamScore[];
