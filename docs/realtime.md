# 실시간 점수 시스템

심판이 입력한 점수를 서버에 모으고, 순위표를 모든 접속자에게 실시간으로 보여준다.
행사장 와이파이가 불안정한 상황을 전제로, **끊기지 않게 하는 것**이 아니라 **끊겨도 점수를 잃지 않고 빠르게 복구하는 것**을 목표로 한다.

## 구성

```
브라우저 (Next, EC2 docker) ──WebSocket──▶ 실시간 서버 (Node, EC2 1대, 서울 리전)
   │  └─ 끊기면 HTTP POST /score ───────▶   └─ SQLite (별도 EBS 볼륨)
   └─ 미확인 점수: IndexedDB 큐
```

- 서버는 **1대**만 운영한다 (300명 규모에 충분, 다중화하면 pub/sub 등이 필요해져 오히려 위험).
- 인증은 Next 로그인 쿠키(HMAC)를 서버가 같은 `AUTH_SECRET`으로 검증한다. 서버는 `COOKIE_DOMAIN`이 공유되는 서브도메인(예: `rt.example.com`)에 둔다.
- 점수 저장 권한은 `judge`, `admin`만 갖는다. 순위표 구독은 로그인한 모든 역할이 가능하다.

| 위치 | 파일 |
|---|---|
| 서버 | `server/src/index.ts` (소켓 + HTTP), `db.ts`, `session.ts`, `schema.ts` (users·teams DDL 단일 출처) |
| 클라이언트 | `lib/realtime/useRealtime.ts`, `lib/realtime/outbox.ts` |
| UI | `components/JudgeConsole.tsx`, `components/LiveLeaderboard.tsx` |

스키마 관리: `server/src/schema.ts` 가 users·teams DDL 의 단일 출처이고, `lib/contest-db.ts` 의 복사본은 `node scripts/sync-schema.mjs` 로 갱신한다 (직접 편집 금지). 나머지 테이블 DDL 은 `server/src/db.ts` 가 정의하고 시작 시 컬럼 추가 마이그레이션을 수행한다. 두 프로세스가 같은 SQLite 파일을 쓰므로 양쪽 모두 `WAL + busy_timeout` 을 설정한다.

## 실행

```bash
cd server && pnpm install && pnpm dev   # :4000
pnpm dev                                # Next :3000
```

개발 중 클라이언트는 접속한 호스트의 `:4000`으로 자동 접속한다 (`judge.localhost:3000` → `judge.localhost:4000`).

### 환경변수

| 변수 | 위치 | 설명 |
|---|---|---|
| `AUTH_SECRET` | Next, 서버 | **반드시 같은 값.** 기본값은 개발용이며, 운영(`NODE_ENV=production`)에서 미설정 시 서버가 기동되지 않는다 |
| `ADMIN_INITIAL_PASSWORD` | 서버 | 최초 기동 시 만들 관리자 계정 비밀번호. 운영에서 관리자 계정이 0개일 때 필수 |
| `JUDGE_INITIAL_PASSWORD` | 서버 | 최초 기동 시 `REF01`~`REF08` 심판 계정을 같이 만들 때 쓸 비밀번호 (선택) |
| `COOKIE_DOMAIN` | Next | `.example.com` — 서브도메인 간 세션 공유 |
| `NEXT_PUBLIC_REALTIME_URL` | Next | 실시간 서버 주소. 빌드 시점에 번들에 포함되므로 바꾸면 재빌드 |
| `CORS_ORIGINS` | 서버 | 허용 Origin, 쉼표 구분 (메인/judge/admin 서브도메인 전부) |
| `PORT` | 서버 | 기본 4000 |
| `DB_PATH` | 서버 | SQLite 파일 경로 (기본 `contest.db`). **스냅샷 대상 볼륨 위**에 둘 것 |
| `CONTEST_DB_PATH` | Next | `contest.db` 경로 (web 컨테이너는 realtime 과 같은 볼륨을 마운트). 로그인·가입 시 읽는다. 이전 `USERS_DB_PATH`/`users.db` 는 폐기 |

## 데이터 유실 방지 (점수를 잃지 않는 장치)

1. **로컬 영구 저장**: 제출한 점수는 심판 브라우저 IndexedDB에 **서버 확인 후에도 지우지 않고** 보관한다 (아래 "로컬 저장" 참고). 서버 확인 전 항목은 새로고침/탭 종료 후에도 복원되어 전송된다.
2. **멱등 저장**: 서버는 (경기, 팀, 심판)당 1행으로 upsert하고 `ts`가 더 클 때만 덮어쓴다. 재전송, 중복, 순서 뒤바뀜이 있어도 안전하다. 그래서 확인을 못 받았으면 **무조건 재전송**한다.
3. **심판 ID는 서버가 세션에서 결정**한다. 클라이언트가 보낸 값은 쓰지 않는다.
4. 서버가 거부한 점수(`invalid`, `forbidden`)는 재시도해도 결과가 같으므로 큐에서 빼고 화면에 표시한다. 로그인 만료(`unauthorized`)는 **큐에 남겨** 재로그인 후 전송한다.

## 로컬 저장 (심판 브라우저)

`lib/realtime/outbox.ts`

| 값 | 저장소 | 용도 |
|---|---|---|
| 제출한 점수 전체 | IndexedDB `score-outbox` | 전송 큐 + 영구 기록. (경기, 팀)당 최신 1건 |
| 마지막으로 받은 순위표 | localStorage `last-standings` | 오프라인 새로고침 시 빈 화면 방지. 화면에 "마지막 수신 시각" 표시 |
| 입력 중이던 경기 번호 | localStorage `judge-match-id` | 새로고침 후에도 유지 |

점수 항목의 상태:

- `pending` — 서버 확인 전. 확인될 때까지 3초마다 재전송
- `acked` — 서버가 저장을 확인함. **삭제하지 않고 기록으로 유지**
- `rejected` — 서버가 거부(`invalid`/`forbidden`). 재시도하지 않음

저장소 보호:

- 앱 시작 시 `navigator.storage.persist()`를 요청해서 브라우저가 저장 공간 부족 시 데이터를 임의로 지우지 못하게 한다 (브라우저가 거부할 수 있음).
- IndexedDB/localStorage를 쓸 수 없는 환경(사생활 보호 모드 등)에서는 조용히 건너뛰고 메모리로만 동작한다. **심판은 일반 창에서 사용**하도록 안내한다.
- 브라우저 사이트 데이터를 지우거나 다른 기기/브라우저로 바꾸면 로컬 기록은 사라진다.

**서버 복구 후 재전송**: `useRealtime()`이 돌려주는 `resendAll()`을 호출하면 `acked` 항목을 다시 `pending`으로 돌려 전부 보낸다. 서버는 `ts` 비교로 처리하므로 안전하다. 심판 화면(`/judge`) 목록 하단의 "저장된 점수 전체 재전송" 버튼이 이를 호출한다.

- 서버에 행이 없으면 새로 삽입된다 (스냅샷 이후에 입력된 점수 복원).
- 서버의 행이 더 오래됐으면 갱신된다.
- 서버의 행이 같거나 더 최신이면 무시된다.

## 연결 끊김 대응

| 항목 | 값 | 위치 |
|---|---|---|
| 끊김 감지 | 최대 약 10초 (ping 5초 + timeout 5초) | `server/src/index.ts` |
| 재연결 간격 | 0.3초 ~ 2초 (기본값은 최대 5초) | `useRealtime.ts` |
| 네트워크 복구 즉시 재연결 | 브라우저 `online` 이벤트에서 backoff 없이 재시도 | `useRealtime.ts` |
| 짧은 끊김 세션 복구 | 2분 | `server/src/index.ts` |
| 재전송 주기 / ack 타임아웃 | 3초 / 5초 | `useRealtime.ts` |

### HTTP 폴백

소켓이 연결되어 있지 않으면 같은 점수를 `POST /score`(쿠키 인증, JSON)로 보낸다. WebSocket이 막힌 공유기나 방화벽에서도 점수가 들어간다.

- 응답: `200 {ok:true}`, `401 unauthorized`, `403 forbidden`, `400 invalid`
- CORS는 `CORS_ORIGINS`에 있는 Origin만 허용한다. 본문은 4KB 제한.
- 응답이 없거나 JSON이 아닌 응답(프록시 오류 페이지 등)은 실패로 보고 다음 주기에 재시도한다.
- 폴백으로 저장돼도 서버가 소켓 구독자에게 순위표를 푸시한다.

## 서버 스냅샷 (필수)

> **대회 운영 전 스냅샷 설정을 끝내지 않으면 배포하지 않는다.**
> 서버는 1대이므로 DB 볼륨이 사라지면 점수가 전부 사라진다. 스냅샷이 유일한 복구 수단이다.

### 설정

1. DB를 루트 볼륨이 아닌 **전용 EBS 볼륨**(예: `/data`)에 둔다. `DB_PATH=/data/contest.db`.
   `contest.db-wal`, `contest.db-shm`이 같은 볼륨에 있어야 한다 (SQLite WAL 모드).
2. 그 볼륨에 태그를 붙인다 (예: `backup=scores`).
3. **Amazon Data Lifecycle Manager** 정책을 만든다 (EC2 > Elastic Block Store > Lifecycle Manager):
   - 대상: 위 태그가 붙은 볼륨
   - 주기: **1시간마다** (DLM의 최소 간격). 보관: 최근 48개 이상
4. 대회 당일에는 정책 외에 **수동 스냅샷**도 찍는다:
   - 대회 전날 (최종 구성 상태)
   - 각 라운드 종료 직후
   - 대회 종료 직후 (최종 결과 보관)

스냅샷은 파일시스템 단위의 crash-consistent 복제다. SQLite는 WAL로 복구되므로 서버를 멈추지 않고 찍어도 된다.

### 복구 절차

1. 최근 스냅샷에서 새 EBS 볼륨을 만든다 (같은 AZ).
2. 인스턴스에 연결하고 `/data`에 마운트한다.
3. 서버를 재시작한다. 같은 `DB_PATH`로 그대로 올라온다.
4. 미확인(`pending`) 점수는 서버가 돌아오면 자동 재전송된다.
5. 스냅샷 시점 이후에 이미 확인된 점수는 서버에서 사라졌으므로, **모든 심판 기기에서 `/judge` 목록 하단의 "저장된 점수 전체 재전송"을 누른다.** 각자 브라우저에 남은 기록(채점지와 서명 포함)이 서버로 복원된다.
6. 복구 후 순위표를 심판들의 입력 기록과 대조한다.

### 운영 체크리스트

- [ ] DLM 정책 생성 후 첫 스냅샷이 실제로 만들어졌는지 확인
- [ ] 스냅샷으로 **복구 리허설**을 1회 해본다 (새 볼륨 생성 → 마운트 → 서버 기동 → 순위표 확인)
- [ ] `AUTH_SECRET`이 Next와 서버에서 같은 값인지 확인
- [ ] Elastic IP와 HTTPS 적용, `/health`가 `ok`를 반환하는지 확인
- [ ] 대회 전날 300 연결 부하 테스트
- [ ] 심판 기기는 일반(비시크릿) 창 사용, 대회 중 사이트 데이터 삭제 금지 안내
- [ ] 심판용 별도 네트워크(LTE/5G 핫스팟 등) 준비 — 클라이언트는 네트워크가 바뀌어도 자동 재연결한다

## 심판 채점 화면 (`/judge`)

MVP(단일 HTML) 중 심판 흐름을 우리 코드로 옮긴 것이다. 로컬 파일을 iframe으로 띄우던 `app/judge/mvp` 라우트는 제거했다.

흐름: 내 담당 경기 목록 → 채점 → 공동 확인 → 서명(심판, 참가팀 대표) → 완료(서버 전달)

| 파일 | 역할 |
|---|---|
| `lib/judge/rules.ts` | 채점 항목표, 자동 보너스·감점 계산(`calc`), 입력 검증(`validate`) |
| `lib/judge/data.ts` | 참가팀 데모 데이터. **화면 표시는 쓰지 않는다** — 클라이언트는 `lib/contest.ts`(서버 `/config`)를 쓴다. 가입 검증(`app/signup/actions.ts`)만 아직 참조하며, 인증 교체(계정 DB화) 때 함께 제거한다 |
| `lib/judge/sheets.ts` | 작성 중 채점지를 기기(localStorage)에 자동 저장, 서버로 보낼 채점지 생성(`sheetPayload`) |
| `components/JudgeConsole.tsx` | 화면 전환, 서버 제출, 제출 상태 표시, 전체 재전송 버튼 |
| `components/judge/*` | `ScoreView`, `ReviewView`, `SignView`, `SignaturePad`(캔버스 서명) |

- 채점 계산은 MVP 원본 코드와 무작위 입력 10,000건으로 대조해 결과가 같음을 확인했다. 동작을 바꾸려면 `rules.ts`만 고친다.
- 담당 테이블: 로그인 ID가 `REF01`~`REF08`이면 해당 테이블로 고정된다. 그 외 계정은 화면에서 직접 고른다.
- 입력은 매번 이 기기에 자동 저장된다. 확인·서명 중에 점수를 고치면 작성 중으로 돌아가고 받아둔 서명은 무효가 된다.
- 서명까지 마치면 `submitScore(경기ID, 팀ID, 총점, 채점지)`로 제출한다. 서버가 끊겨 있어도 "이 기기에 저장했어요"로 끝까지 진행되고, 연결되면 자동 전송된다.
- 서명 완료 후에는 심판이 수정할 수 없다. 정정은 운영본부(관리자)를 통해 한다.
- 목록에 경기별 서버 제출 상태(전송 대기 / 서버 저장됨 / 거부됨)와 "저장된 점수 전체 재전송" 버튼이 있다.
- 빈 채점지에서 시니어는 -66점으로 시작한다. 키트가 없는 목적지(-10×3)와 제 위치에 없는 실린더(-3×12)가 자동 감점되기 때문이며, MVP 원본과 같은 동작이다.

### 서버에 저장되는 값

- `points`: 총점. **채점지(`sheet`)**: 항목별 입력값, 사전 확인, 소계, 서명 이미지(PNG), 서명자, 서명 예외 사유, 서명 시각을 JSON으로 함께 저장한다. (경기, 팀, 심판)당 한 행이며 더 최신 `ts`만 반영한다.
- 채점지 상한은 400KB. 초과하면 `413 too_large`로 거부되고(연결을 끊지 않는다), 화면에 거부 사유가 표시된다.
- 이전 버전 DB(`sheet` 컬럼 없음)는 서버 시작 시 자동으로 컬럼이 추가된다.

### 순위 규칙

부문(시니어/주니어)별로 따로 매긴다. 팀의 1·2차 점수 중 **최고점** → 동점이면 **조별 합계** → **감점 적은 순**(두 라운드 `pen_cnt` 합계) → 팀 ID 순. 동점(total·합계·감점 모두 같음)은 화면에서 같은 순위로 표기한다. 합계가 아니라 최고점이므로 2차에서 점수가 낮아도 순위가 낮아지지 않는다.
확정(`confirmed`/`modified`) 점수가 없는 팀은 `total=0, pen=0`으로 취급해 순위판에 명단 전체가 항상 표시된다 — 집계 전에도 빈 화면 대신 0점 표로 뜬다. 각 라운드의 확정 최고점(`r1`/`r2`)도 같이 날아와 1R→2R 흐름을 화면에 표시한다.
8강 진출은 부문 내 상위 8팀. 동점이 8위 컷오프에 걸리면 관리자가 드래그로 순서를 정해 `rank_order` 설정으로 저장하고, 클라이언트는 계산 순위 대신 그 순서를 쓴다.

## 현재 화면 연결 상태

| 화면 | 상태 |
|---|---|
| `/judge` (`JudgeConsole`) | 연결됨 — 제출, 오프라인 큐, 제출 상태, 전체 재전송. 채점 항목은 서버 템플릿(없으면 기본 규칙) 사용 |
| `/contest` (`RankingBoard`/`TournamentBracket`) | 연결됨 — 순위표 실시간 구독. 대진표 탭은 관리자가 저장한 배정과 경기 결과(승자·점수) 표시, 저장 전엔 예선 순위 시드 배치 |
| `/mypage` (`ParticipantPortal`) | 연결됨 — 랭킹 탭 순위표 구독, 내 점수표 탭 실시간 팀 점수·순위, 서버 공지 배너 |
| `/admin` (`AdminDashboard`) | 연결됨 — 대시보드 집계·활동 로그·확정 대기, 채점 목록+CSV, 템플릿 CRUD, 토너먼트 배정 저장, 계정 집계·재발급·CSV, 설정(자동 확정·보드 공개·점수 가리기·공지) |

운영 전에 정리할 것:

- ~~팀·대진 데모 데이터~~ → 클라이언트는 서버 `/config`(`lib/contest.ts`)를 쓴다. 서버는 `contest.db`로 관리 (`docs/api-design.md` 참고). 남은 것: 인증 교체 때 `signup/actions.ts`의 정적 명단 참조 제거.
- 점수 확정 워크플로는 서버에 구현됐다 (`scores.status`, `/admin/scores/confirm|modify|reject`, 자동 확정 설정, 감사 로그). 관리자 대시보드 UI 연결은 별도 진행 항목이다.
- 순위판은 서버 팀 명단으로 팀 ID를 이름으로 바꿔 표시한다. 명단에 없는 ID는 그대로 보인다.

## 인증과 계정

- 로그인·가입은 Next 서버 액션(`app/login/actions.ts`, `app/signup/actions.ts`)이 처리하고, 비밀번호는 전부 `contest.db` users 테이블의 scrypt 해시와 비교한다 (`lib/users.ts`). 코드에 평문 계정은 없다.
- 계정은 세 종류: 참가자(`user`, 본선 명단 팀+이름으로 가입 → 팀 연결), 심판(`judge`), 관리자(`admin`). 심판·관리자는 관리자 화면에서 CSV 일괄 발급 (`POST /admin/accounts/issue`) 하거나 비밀번호 일괄 재발급 (`POST /admin/accounts/reset-password`). 발급된 임시 비밀번호는 평문으로 한 번만 반환되고 `must_change=1` 로 표시된다.
- 로그인할 때마다 `last_login_at` 이 갱신돼 관리자의 접속 현황 집계에 쓰인다.
- 세션은 7일 HMAC 토큰 + `token_version` 대조다. 비밀번호 일괄 재발급이나 `POST /admin/sessions/revoke-all` 을 실행하면 기존 세션이 즉시 무효화되고 전원 재로그인한다. 토큰의 role·teamId 도 매 요청 DB 와 대조한다.
- 로그인·가입 시도 제한이 있다 — 틀린 로그인 5회/10분이면 10분 차단, 가입은 IP 당 20회/시간. scrypt 는 비동기로 돌려 이벤트 루프를 막지 않는다.
- 운영(`NODE_ENV=production`)에서는 `AUTH_SECRET` 이 빈 값이거나 개발용 기본값이면 Next/서버 모두 요청 처리 시점에 거부한다.
- 최초 관리자·심판 계정은 서버 부트스트랩이 만든다. 비밀번호는 코드에 기본값이 없고 **반드시 환경변수**로만 지정한다 — 개발은 `server/.env.example` 을 `server/.env` 로 복사(`ADMIN_INITIAL_PASSWORD`, 선택 `JUDGE_INITIAL_PASSWORD`), 운영은 배포 환경변수. `pnpm dev` 는 `server/.env` 를 자동으로 읽는다. 심판 `REF01`~`REF08` 의 공유 임시 비밀번호는 감사 신뢰도를 떨어뜨리니, 운영 전에 '비밀번호 일괄 재발급' 으로 개별화한다.
- `REF01`~`REF08` 계정은 담당 테이블이 ID 에서 고정된다 (`components/JudgeConsole.tsx` 의 `fixedTable`). 그 외 심판은 `judge_table`/`judge_assignments` 로 배정.
- 이전 `users.db` 는 contest.db 첫 생성 시 자동으로 합쳐진다.

## 알려진 한계

- 서버 1대이므로 EC2가 죽으면 그동안은 모두 끊긴다. 점수는 각 심판 브라우저에 쌓이고 서버 복구 후 전송된다.
- 로컬 기록은 그 브라우저에만 있다. 심판이 사이트 데이터를 지우거나 기기를 바꾸면 그 기기의 기록은 사라진다 (서버에 확인된 분은 스냅샷으로 남는다).
- 네트워크가 끊긴 상태에서는 순위표가 갱신되지 않는다 (마지막 수신 값이 유지됨).
