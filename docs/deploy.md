# AWS 배포

EC2 1대(서울) 에서 Docker Compose 로 `web`(Next) + `realtime`(socket.io+SQLite) + `caddy`(HTTPS) 실행.
`main` 푸시 → GitHub Actions 가 이미지를 ECR 에 올리고 SSM 으로 서버를 갱신한다. SSH 없음.

```
@, judge., admin. ─▶ caddy ─▶ web:3000
rt.                ─▶ caddy ─▶ realtime:4000 ─ SQLite (/data/realtime, 별도 EBS, 매시 스냅샷 7일)
```

## 최초 1회

1. 세션 서명 키를 Parameter Store 에 저장 (스택보다 먼저, 리전 `ap-northeast-2`):
   ```bash
   aws ssm put-parameter --region ap-northeast-2 --name /robotics/auth-secret \
     --type SecureString --value "$(openssl rand -hex 32)"
   ```
   스택 생성 (계정에 **기본 VPC 필요** — 없으면 `aws ec2 create-default-vpc`):
   ```bash
   aws cloudformation deploy --region ap-northeast-2 --stack-name robotics \
     --template-file deploy/infra.yml --capabilities CAPABILITY_IAM \
     --parameter-overrides Domain=example.com
   ```
   계정에 GitHub OIDC provider 가 이미 있으면 `CreateOidcProvider=false ExistingOidcProviderArn=<arn>` 추가.
2. 출력된 `PublicIp` 를 DNS A 레코드로: `@`, `judge`, `admin`, `rt`.
3. GitHub 레포 설정: Secret `AWS_ROLE_ARN` = 출력 `DeployRoleArn`, Variable `DOMAIN` = `example.com`.
4. `main` 에 푸시 (또는 Actions 에서 deploy 수동 실행). 첫 배포 때 Caddy 가 인증서를 발급한다 (DNS 가 먼저 반영돼야 함).

## 참고

- `AUTH_SECRET` 은 Parameter Store `/robotics/auth-secret` 에만 있고 배포 때마다 읽는다. 바꾸려면 `put-parameter --overwrite` 후 재배포 — 모든 세션이 로그아웃된다.
- **최초 관리자 계정**: realtime 서버 최초 기동(관리자 계정 0개) 시 `ADMIN_INITIAL_PASSWORD` 로 `admin` 계정이 만들어진다. `/opt/app/.env` 에 `ADMIN_INITIAL_PASSWORD=...` 를 넣으면 compose 가 그대로 전달한다 (미설정이면 기동은 되지만 경고만 남기고 로그인할 계정이 없으니, 배포 직후 확인). 이후 심판·관리자 계정은 관리자 화면(팀 · 계정 탭)의 '계정 발급 (CSV)' 으로 일괄 발급하고, 비밀번호는 '비밀번호 일괄 재발급' 으로 갱신한다. `JUDGE_INITIAL_PASSWORD` 를 두면 `REF01`~`REF08` 심판 계정도 함께 만들어진다.
- 배포 성공 = web `/api/health` + realtime `/health` 가 응답. 실패하면 직전 태그로 롤백하고 Actions 가 실패 처리한다.
- Compose(v5.7.0), Caddy(2.11.9) 는 버전 고정. GitHub Actions 는 메이저 태그(`@v4`) 사용 — 필요하면 커밋 SHA 로 고정.
- `NEXT_PUBLIC_REALTIME_URL` 은 빌드 시 `https://rt.$DOMAIN` 으로 고정된다.
- 로그: SSM Session Manager 접속 후 `cd /opt/app && docker compose logs -f`.
- 롤백: Actions 에서 이전 커밋의 워크플로를 재실행하거나, 서버에서 `./deploy.sh <이전 커밋 SHA>`.
- 점수 DB 복구: 스냅샷에서 볼륨 생성 → 교체. 기존 "서버 스냅샷 절차" 는 `docs/realtime.md` 참고.
