# 2026RoboticsChallenge

로봇 대회 실시간 점수·순위·토너먼트 시스템. Next.js 웹 + socket.io realtime 서버 + SQLite(단일 파일).

## 구성

- `app/` · `components/` · `lib/` — Next.js 웹 (참가자·심판·관리자 화면, 공개 순위판)
- `server/` — realtime 서버 (계정·점수·대진·토너먼트, socket.io + HTTP 평번). 계정 DB 는 여기만 연다
- `deploy/` — EC2 Docker Compose + Caddy + GitHub Actions
- `docs/` — 설계·배포·운영 문서

## 개발 실행

요구: Node 22.18 이상(`node:sqlite` 사용 — 권장 24+), pnpm 12.

### 웹

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

### realtime 서버

```bash
cd server
cp .env.example .env   # 개발용 값 채우기 (AUTH_SECRET, ADMIN_INITIAL_PASSWORD …)
pnpm dev               # :4000
```

최초 기동 시 기본 명단·대진과 기본 계정(`team-*`, `admin`·`admin2`, `REF01`~`REF16`)이 만들어진다.
개발에서 `DEFAULT_PASSWORD` 를 비워 두면 임의 값이 서버 로그에 한 번 출력된다(운영에서는 미설정 시 기동 거부).
관리자가 재발급한(또는 기본) 비밀번호로 처음 로그인하면 비밀번호 변경이 강제된다.

## 검증

```bash
pnpm typecheck && pnpm test            # 웹
cd server && pnpm typecheck && pnpm test
```

## 배포

`main` 푸시 → CI(ci.yml: 타입 체크 + 테스트) → deploy.yml(웹) · deploy-backend.yml(realtime 서버) 순으로 배포된다.
서버 환경변수(AUTH_SECRET, INTERNAL_API_SECRET, DEFAULT_PASSWORD, CORS_ORIGINS…)와 절차는 아래 문서 참고.

## 문서

- [실시간 점수 시스템](docs/realtime.md) — 구성, 연결 끊김 대응(HTTP 평번, 빠른 재연결), 스냅샷 절차
- [AWS 배포](docs/deploy.md) — EC2 + Docker Compose, GitHub Actions 자동 배포
- [운영 가이드](docs/operations.md) — 백업·복원·장애 대응, 대회 전 보안 체크리스트
- [API 설계](docs/api-design.md) · [Design.md](Design.md) — 설계 노트
