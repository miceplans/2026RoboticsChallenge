import { DatabaseSync } from 'node:sqlite';

export type ScoreInput = {
  matchId: string;
  teamId: string;
  judgeId: string;
  points: number;
  ts: number;
  sheet: string | null; // 채점지 전체(JSON 문자열). 점수만 보내는 경우 null
};
export type ScoreRow = { matchId: string; teamId: string; judgeId: string; points: number; ts: number; refName: string | null; signException: string | null };
export type Standing = { teamId: string; total: number };
export type RobotApproval = { teamId: string; robotCount: number; approvedRobotIds: string[]; updatedAt: number };

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
  CREATE TABLE IF NOT EXISTS robot_approvals (
    team_id TEXT PRIMARY KEY,
    robot_count INTEGER NOT NULL DEFAULT 0,
    approved_robot_ids TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);
if (!(db.prepare('PRAGMA table_info(robot_approvals)').all() as { name: string }[]).some((c) => c.name === 'robot_count')) {
  db.exec('ALTER TABLE robot_approvals ADD COLUMN robot_count INTEGER NOT NULL DEFAULT 0');
}
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
// 관리자 채점 목록용. 채점지 전체(서명 이미지 포함)는 보내지 않고 필요한 필드만 뽑는다.
const scoreList = db.prepare(`
  SELECT match_id AS matchId, team_id AS teamId, judge_id AS judgeId, points, ts,
         json_extract(sheet, '$.refName') AS refName, json_extract(sheet, '$.signException') AS signException
  FROM scores ORDER BY ts DESC
`);
const robotApprovalOf = db.prepare('SELECT team_id AS teamId, robot_count AS robotCount, approved_robot_ids AS approvedRobotIds, updated_at AS updatedAt FROM robot_approvals WHERE team_id = ?');
const saveRobotApprovalStatement = db.prepare(`
  INSERT INTO robot_approvals (team_id, robot_count, approved_robot_ids, updated_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT (team_id) DO UPDATE SET robot_count = excluded.robot_count, approved_robot_ids = excluded.approved_robot_ids, updated_at = excluded.updated_at
`);

export const saveScore = (s: ScoreInput) => upsert.run(s.matchId, s.teamId, s.judgeId, s.points, s.ts, s.sheet);
export const getScoreList = () => scoreList.all() as ScoreRow[];
export const getStandings = () => standings.all() as Standing[];
export const getRobotApproval = (teamId: string): RobotApproval | null => {
  const row = robotApprovalOf.get(teamId) as { teamId: string; robotCount: number; approvedRobotIds: string; updatedAt: number } | undefined;
  if (!row) return null;
  try {
    const ids = JSON.parse(row.approvedRobotIds);
    if (!Array.isArray(ids)) return null;
    const approvedRobotIds = ids.filter((id): id is string => typeof id === 'string');
    const inferredCount = approvedRobotIds.reduce((max, id) => /^R[1-9]\d*$/.test(id) ? Math.max(max, Number(id.slice(1))) : max, 0);
    return { ...row, robotCount: Math.max(row.robotCount, inferredCount), approvedRobotIds };
  } catch {
    return null;
  }
};
export const saveRobotApproval = (approval: RobotApproval) => saveRobotApprovalStatement.run(approval.teamId, approval.robotCount, JSON.stringify(approval.approvedRobotIds), approval.updatedAt);
