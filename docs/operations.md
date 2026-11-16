# 운영 가이드 (단일 서버)

대회 점수 시스템은 **realtime 서버 1대 + SQLite 1개**로 돌아간다. 구조상 단일 장애점이
존재하므로, 장애 시간을 줄이는 절차를 사전에 숙지해 둔다.

## 아키텍처 요약

- `web` (Next.js): 페이지·로그인 폼. 계정 DB 는 열지 않고 realtime 서버에 서버 간 호출 (`REALTIME_URL`).
- `realtime` (socket.io + HTTP): 계정·점수·대진의 유일한 쓰기 주체. SQLite(`/data/contest.db`, WAL)를 연다.
- `caddy`: 리버스 프록시 + TLS. `x-forwarded-proto` 를 설정하므로 쿠키 secure 판별에 쓴다.
- 로그인 시도 제한은 **인메모리**다. 컨테이너 재시작하면 카운터가 초기화된다.

## 백업

`server/scripts/backup-db.mjs` — `VACUUM INTO` 로 서버를 멈추지 않고 일관된 스냅샷을 만든다.
스크립트는 레포의 `server/scripts/` 를 서버(예: `/opt/app/scripts/`)에 한 번 복사해 두고 cron 으로 돌린다.

```bash
# cron 예시 (6시간마다, 최근 28개 보관)
0 */6 * * * DB_PATH=/data/contest.db BACKUP_DIR=/data/backups KEEP=28 /usr/bin/node /opt/app/scripts/backup-db.mjs >> /var/log/contest-backup.log 2>&1
```

- 백업 볼륨은 EBS 볼륨(`/data`)에 두고 AWS 스냅샷 정책을 함께 쓴다(compose 볼륨 주석 참고).
- 백업 파일은 `PRAGMA integrity_check` 를 통과해야 보관된다. 로그에 `teams=N` 이 찍히는지 확인.

## 복원

```bash
cd /opt/app
docker compose stop realtime
cp /data/backups/contest-<시각>.db /data/contest.db
rm -f /data/contest.db-wal /data/contest.db-shm   # 남은 WAL 은 복사본 기준으로 다시 생긴다
docker compose up -d realtime
```

복원 직후 관리자 로그인 → 대시보드(경기 수·확정 대기)가 대회 진행 시점과 맞는지 확인한다.

## 장애 대응

- **realtime 다운**: web(정적 화면)은 떠 있어도 로그인·제출이 안 된다. `docker compose ps realtime` → `up -d realtime` 재시작. 점수 데이터는 SQLite 파일에 남아 있어 유실되지 않는다(제출 중이던 소켓 연결 한 건 정도만 재입력).
- **컨테이너 재배포 중**: 배포(이미지 교체)는 수 초 걸린다. 심판에게 "제출이 끊기면 화면의 재전송을 그대로 두라"고 안내 — 제출은 upsert + ts 비교라 중복이 안 생긴다.
- **EBS 볼륨 손실**: 최신 백업으로 복원. 백업 시각 이후의 점수는 감사 로그(`score_audit`)와 심판 채점지 원본으로 수동 재입력.

## 보안 운영 체크리스트 (대회 전)

- `/opt/app/.env` 필수 값: `AUTH_SECRET`(32자+), `INTERNAL_API_SECRET`, `DEFAULT_PASSWORD`, `ADMIN_INITIAL_PASSWORD`(최초 1회용), `CORS_ORIGINS`.
- 관리자·심판 비밀번호 일괄 재발급(`POST /admin/accounts/reset-password`) → 재발급된 계정은 첫 로그인 시 비밀번호 변경이 강제된다.
- 대회 시작 전 `POST /admin/sessions/revoke-all` 로 전 세션 정리.
- `TRUST_PROXY` 는 Caddy 앞 구성에서만 `1`로 설정한다(직접 노출 시 IP 위조 가능).
- 프록시 없이 realtime 을 노출할 경우 `COOKIE_SECURE=true` 로 쿠키 secure 를 고정한다.

## 한계 (알고 넘어갈 것)

- 서버 1대라 수평 확장이 없다. 동시 접속 수천 규모라면 더 큰 인프라(Aurora/PubSub 등)로의 이설이 필요하다.
- 로그인 제한·브로드캐스트 상태가 메모리에 있어 재시작하면 리셋된다. 무차별 대입 방어는 재시작으로 풀리지만, IP 단위 한도가 다시 걸리므로 운영상 허용 범위다.
