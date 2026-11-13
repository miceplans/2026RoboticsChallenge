# 대회 데이터 구조 · 관리자 API 설계

> 목표: 하드코딩된 팀·대진·계정 데이터를 DB로 옮기고, 점수 확정 워크플로와 관리자 기능을 서버 API로 구현한다.
> 우선순위(구현 순서): 2(팀·대진 DB) → 3(확정 워크플로) → 1(인증) → 4(관리자 대시보드) → 5(순위 규칙) → 6(토너먼트) → 7(운영 안정성)

## 1. 구조 결정

### 결론

1. **관리자 API는 실시간 서버(`server/`)에 REST로 모은다.** Next route handler/server action에 두지 않는다.
2. **DB는 `scores.db`를 확장한 단일 `contest.db`로 통합한다.** 참가자 계정(`users.db`)도 이 파일로 합친다. 두 프로세스(Next, realtime 서버)가 같은 호스트에서 같은 SQLite 파일을 여는 것은 `lib/users.ts`가 이미 검증한 패턴(WAL + busy_timeout)이다.

### 이유

| 고려 | 서버(server/)에 관리자 API | Next에 관리자 API |
|---|---|---|
| 점수 데이터 소유 | scores 테이블을 쓰는 코드와 같은 프로세스 | Next가 scores.db를 추가로 열어 두 프로세스 쓰기 발생 |
| 실시간 반영 | 확정·설정 변경 즉시 `io.emit` (공지, 보드 비공개, 순위판) | 서버에 별도 알림 채널 필요 (복잡도 ↑) |
| 인증 | `sessionFromCookie` + AUTH_SECRET 이미 구현됨 | 동일하게 가능하나 로직 이중 |
| 기존 API 일관성 | `/score`, `/team-scores`와 같은 서피스·응답 포맷 | 클라이언트가 두 베이스 URL 다룸 |
| 배포/복구 | 서버 1대 + EBS 스냅샷 체계의 중심 (docs/realtime.md) | 스냅샷 대상·복구 절차 분산 |

### 배포 구성 변경 (docker-compose.yml)

- `realtime`: `DB_PATH=/data/contest.db`
- `web`: 볼륨 `- /data/realtime:/data` 추가 + `CONTEST_DB_PATH=/data/contest.db`
  → users.db가 현재 컨테이너 쓰기 레이어(스냅샷 대상 아님)에 있는 운영 구멍도 함께 해소. `USERS_DB_PATH`는 폐기.
- 스냅샷/복구 절차는 파일 이름만 바뀌고 동일 (docs/realtime.md 갱신).

### 인증 방식 (공통)

- 세션 쿠키(HMAC 토큰) 그대로. 서버가 `sessionFromCookie`로 검증, 관리자 API는 `role === 'admin'` 필수.
- 관리자 화면은 admin 서브도메인에서만 동작하고 쿠키는 `sameSite=lax` + JSON 본문만 받으므로 별도 CSRF 토큰은 두지 않는다.

## 2. DB 스키마 (contest.db)

### users (기존 users.db 확장, 참가자 + 심판 + 관리자 통합)

```sql
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','judge','admin')),
  team_id       TEXT,              -- 참가자만 (teams.id)
  judge_table   INTEGER,           -- 심판 담당 테이블 (REF01~08 고정 규칙과 별도 지정 시)
  salt          TEXT NOT NULL,
  hash          TEXT NOT NULL,
  must_change   INTEGER NOT NULL DEFAULT 0,  -- 일괄 재발급 후 강제 변경 표시
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER            -- 미접속 집계용
);
CREATE UNIQUE INDEX users_team_member ON users (team_id, name) WHERE role = 'user';
```

- `REF01`~`REF08` → 담당 테이블 고정 규칙은 코드에서 파생(기존 동작 유지). 그 외 심판은 `judge_assignments`로 배정.

### teams (lib/judge/data.ts TEAMS 이동)

```sql
CREATE TABLE teams (
  id      TEXT PRIMARY KEY,          -- J01..S16
  cat     TEXT NOT NULL CHECK (cat IN ('J','S')),
  code    TEXT NOT NULL,
  name    TEXT NOT NULL UNIQUE,      -- 가입 검증이 팀 이름으로 함
  region  TEXT, org TEXT, coach TEXT,
  members TEXT NOT NULL              -- JSON 배열 (첫 번째가 팀장)
);
```

### matches (MATCHES 이동, 관리자 수정 가능)

```sql
CREATE TABLE matches (
  id       TEXT PRIMARY KEY,         -- R1-J01
  round    INTEGER NOT NULL CHECK (round IN (1,2)),
  cat      TEXT NOT NULL CHECK (cat IN ('J','S')),
  wave     TEXT NOT NULL CHECK (wave IN ('A','B')),
  table_no INTEGER NOT NULL,
  field    TEXT NOT NULL CHECK (field IN ('좌','우')),
  team_id  TEXT NOT NULL REFERENCES teams(id)
);
```

### judge_assignments (REF 외 추가 심판용)

```sql
CREATE TABLE judge_assignments (
  judge_id TEXT NOT NULL REFERENCES users(id),
  round    INTEGER NOT NULL,
  table_no INTEGER NOT NULL,
  PRIMARY KEY (judge_id, round)
);
```

### scores (확정 워크플로)

```sql
ALTER TABLE scores ADD COLUMN status       TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending','confirmed','modified','rejected'));
ALTER TABLE scores ADD COLUMN pen_cnt      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scores ADD COLUMN confirmed_at INTEGER;
ALTER TABLE scores ADD COLUMN confirmed_by TEXT;
-- PK (match_id, team_id, judge_id), ts 비교 upsert, sheet 컬럼은 그대로
```

- 제출 시 상태: 설정 `auto_confirm=1`이면 `confirmed`, 아니면 `pending`.
- 순위에는 `confirmed`, `modified`만 반영. `rejected`는 사유와 함께 감사 로그에 남는다.
- 관리자 수정: `points`(와 필요 시 sheet)를 덮고 상태를 `modified`로, 이전 값은 `score_audit`에 보관.
- 심판 재전송 규칙: `pending`/`rejected`만 더 새로운 ts 로 덮을 수 있다. `confirmed`·`modified`는 심판이 덮지 못한다 — 정정은 관리자 확인을 거친다. 제출은 실제 대진과 대조(경기 존재, 팀 일치, 담당 테이블, 점수/ts 범위)해 검증한다.

### score_audit (감사 로그 = 대시보드 활동 로그 소스)

```sql
CREATE TABLE score_audit (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts        INTEGER NOT NULL,
  actor_id  TEXT NOT NULL,           -- 관리자/심판 id
  action    TEXT NOT NULL,           -- submit/confirm/modify/reject/issue/reset_password/template/settings/draw/tournament/login
  entity    TEXT NOT NULL,           -- score/account/settings/template/match/tournament
  entity_id TEXT,
  detail    TEXT                     -- JSON (수정 전 값 포함)
);
```

### settings (키-값)

```sql
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
-- auto_confirm : '0' | '1'
-- board_public : '0' | '1'
-- notice       : '{"message":"...","updatedAt":0}'
-- template     : rules.ts ITEMS 와 동일 형태의 JSON 배열 (채점표 템플릿)
```

### tournament_slots / tournament_games

```sql
CREATE TABLE tournament_slots (
  cat     TEXT NOT NULL CHECK (cat IN ('J','S')),
  slot_no INTEGER NOT NULL CHECK (slot_no BETWEEN 1 AND 16),
  team_id TEXT REFERENCES teams(id),
  PRIMARY KEY (cat, slot_no)
);
CREATE TABLE tournament_games (
  cat        TEXT NOT NULL CHECK (cat IN ('J','S')),
  round      TEXT NOT NULL CHECK (round IN ('R16','QF','SF','F','3P')),
  game_no    INTEGER NOT NULL,
  team_a     TEXT,
  team_b     TEXT,
  score_a    REAL, score_b REAL,
  winner     TEXT,
  status     TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','done')),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (cat, round, game_no)
);
```

- 16팀 단일 elimination: `R16`(8경기) → `QF`(4) → `SF`(2) → `F`(결승), 준결승 패자는 `3P`(3·4위전).
- 결과 저장(`saveTournamentResult`)은 슬롯+모든 결과로 해당 부문을 통째로 재계산한다. 승자가 다음 라운드로 진출하고, 수정한 라운드 아래의 기존 결과는 무효가진다. 배정(`saveTournamentSlots`)을 다시 저장하면 결과가 초기화된다.

## 3. API 설계 (server/src/, REST + 세션 쿠키)

응답 공통: `{ ok: true, ... }` | `{ ok: false, error: string }`. 기존 `/score`, `/team-scores` 포맷 유지.

### 공개 조회 (로그인 필요, 역할별 필터)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/health` | 기존 |
| GET | `/config` | 설정(공개분), 템플릿, teams, matches, tournament 한 번에. `updatedAt` 포함 → 클라이언트 캐시 비교용. JudgeConsole·RankingBoard·AdminDashboard가 기존 `TEAMS`/`MATCHES` import 대신 사용 |
| GET | `/standings` | 순위판 스냅샷. `board_public=0`이면 user/judge에게 빈 배열. 소켓 끊김 시 재검증용 |
| GET | `/team-scores?teamId=` | 기존 |
| GET | `/tournament?cat=` | 토너먼트 슬롯+경기 결과 |

### 심판 (기존 + 확장)

| 메서드 | 경로 | 변경 |
|---|---|---|
| POST | `/score`, 소켓 `score:submit` | 요청에 `penCnt` 추가 (rules.ts `calc()`의 `penCnt`). 서버는 신뢰+저장만. 상태는 `auto_confirm`에 따라 결정 |
| 소켓 | `leaderboard` | 기존. 단 `board_public=0`이면 admin 외에는 빈 배열 전송 |
| 소켓 | `config`, `notice` | 설정/템플릿/팀·대진 변경, 공지 브로드캐스트 (신규) |

### 관리자 (role=admin 전용)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/admin/overview` | 대시보드 집계: 경기 완료/진행, 확정 대기 수, 심판별 제출 현황, 가입/미접속 수 |
| GET | `/admin/activity?limit=` | score_audit 최근 내역 (대시보드 활동 로그) |
| GET | `/admin/pending` | 확정 대기 목록 (팀·경기·심판·서명 시각) |
| POST | `/admin/scores/confirm` | `{matchId, teamId, judgeId}` |
| POST | `/admin/scores/modify` | `{matchId, teamId, judgeId, points, reason?}` → 상태 `modified` |
| POST | `/admin/scores/reject` | `{matchId, teamId, judgeId, reason}` |
| GET | `/admin/scores?status&round&cat&judgeId&format=csv` | 채점 목록 조회·필터·CSV 낳볃내기 |
| GET | `/admin/users?role&q` | 계정 목록 (마지막 로그인 포함) |
| POST | `/admin/accounts/issue` | 계정 CSV 업로드 → 임시 비밀번호 생성 → 결과 CSV 다운로드 |
| POST | `/admin/accounts/reset-password` | `{ids[]}` 또는 `{role:'judge'}` 일괄 재발급 → CSV. `must_change=1` |
| PUT | `/admin/teams` | 팀 목록 전체 교체 (Import). 대진(matches)도 함께 초기화되므로 이어서 matches 재저장 필요 |
| PUT | `/admin/matches` | 대진·심판 배정 수정 |
| GET/PUT | `/admin/settings` | `auto_confirm`, `board_public`, `notice` |
| GET/PUT | `/admin/template` · POST `/admin/template/reset` | 채점표 템플릿 CRUD, "복원"=rules.ts 기본값 |
| PUT | `/admin/tournament/slots` | `{cat, teamIds[16]}` 배정 저장 → 결과 초기화, `/contest` 즉시 반영 |
| POST | `/admin/tournament/result` | `{cat, round, gameNo, scoreA, scoreB}` → 승자 진출·3·4위전 배정. 무승부 불가. 수정 시 하위 라운드 결과 무효 |

모든 관리자 변경은 `score_audit` 기록 + 관련 소켓 브로드캐스트.

## 4. 순위 규칙 (5번)

```sql
SELECT team_id AS teamId, MAX(points) AS total
FROM scores
WHERE status IN ('confirmed','modified')
GROUP BY team_id
ORDER BY total DESC, SUM(points) DESC, SUM(pen_cnt) ASC, team_id;
-- 규정: 최고점 → 조별 합계 → 감점 적은 순 → (마지막 정렬키는 팀 ID로 동률 처리)
```

- `pen_cnt`는 심판 콘솔이 `calc()`로 계산해 제출 시 함께 본다. 시트 JSON에도 값이 있지만 서버는 신뢰 컬럼만 집계한다.

## 5. Next 쪽 변경 요약

- `lib/auth.ts`: `demoUsers` 제거. `getSession`/`requireRole` 유지.
- `lib/users.ts`: `contest.db`의 `users` 테이블 사용 (`CONTEST_DB_PATH`, `USERS_DB_PATH` 폐기). 역할 포함 조회 추가.
- `app/login/actions.ts`: 참가자·심판·관리자 모두 DB 검증. `last_login_at` 갱신.
- `app/signup/actions.ts`: `TEAMS` 대신 `teams` 테이블 조회 (같은 파일이라 네트워크 불필요).
- `lib/judge/data.ts`: 제거. 대신 `lib/contest.ts` 신설 — 서버 `/config` fetch + 캐시(localStorage) + 기존 `teamName` 등 유틸 유지.
- `JudgeConsole`, `LiveLeaderboard`, `RankingBoard`, `ContestView`, `TournamentBracket`, `AdminDashboard`: 정적 import → `/config` 기반 훅 전환. JudgeConsole의 REF01~08 테이블 고정 규칙은 그대로.
- `lib/judge/rules.ts`: `calc()`가 항목 배열을 주입받을 수 있게 (기본값: 내장 `ITEMS`). 템플릿 복원 = 내장값.
- `AdminDashboard`: 각 탭을 위 API로 연결 (활동 로그, 유저 점수, 채점 목록+CSV, 템플릿, 대진 저장, 계정 집계/재발급/CSV, 설정 저장).

## 6. 마이그레이션

- 서버 기동 시: `contest.db`가 없고 `scores.db`가 있으면 스키마를 만들고 scores 데이터만 복사 (users.db 병합은 관리자가 계정 CSV 재발급으로 정리하는 것을 기본, 선택적으로 병합).
- 운영 배포 전: compose 볼륨·환경변수 변경, docs/realtime.md의 경로·복구 절차 갱신, DLM 체크리스트 확인 (이미 문서에 있음).

## 7. 가정

- 감점 적은 순 = 해당 팀의 두 라운드 감점 횟수 합계(`SUM(pen_cnt)`).
- 심판 계정은 REF01~REF08 8개 기준, 초과 심판은 `judge_assignments` 배정.
- `must_change=1` 계정의 "처음 로그인 시 비밀번호 변경" UI는 별도 범위(선택) — 재발급 CSV 배포로 운영.
- `/config`는 로그인한 모든 역할이 조회 (팀 명단·대진은 심판·참가자 화면에도 이미 노출 중).
