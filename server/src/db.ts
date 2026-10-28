import { DatabaseSync } from 'node:sqlite';

export type ScoreInput = { matchId: string; teamId: string; judgeId: string; points: number; ts: number };
export type Standing = { teamId: string; total: number };

const db = new DatabaseSync(process.env.DB_PATH ?? 'scores.db');
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS scores (
    match_id TEXT NOT NULL,
    team_id  TEXT NOT NULL,
    judge_id TEXT NOT NULL,
    points   REAL NOT NULL,
    ts       INTEGER NOT NULL,
    PRIMARY KEY (match_id, team_id, judge_id)
  );
`);

// 같은 (경기, 팀, 심판)은 한 행. 재전송/순서 뒤바뀜이 있어도 ts 가 더 최신일 때만 덮어쓴다.
const upsert = db.prepare(`
  INSERT INTO scores (match_id, team_id, judge_id, points, ts)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT (match_id, team_id, judge_id) DO UPDATE
    SET points = excluded.points, ts = excluded.ts
    WHERE excluded.ts > scores.ts
`);

const standings = db.prepare(`
  SELECT team_id AS teamId, SUM(points) AS total
  FROM scores GROUP BY team_id ORDER BY total DESC
`);

export const saveScore = (s: ScoreInput) => upsert.run(s.matchId, s.teamId, s.judgeId, s.points, s.ts);
export const getStandings = () => standings.all() as Standing[];
