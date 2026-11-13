#!/bin/bash
# 서버(EC2)에서 실행. 사용: deploy.sh <TAG> [all|web|realtime]   (SSM 으로 GitHub Actions 가 호출)
# 지정한 서비스만 새 태그로 올리고 나머지는 현재 태그 유지. 헬스체크 실패하면 직전 태그로 되돌리고 실패(exit 1).
set -euo pipefail
cd /opt/app
TAG="${1:-latest}"
TARGET="${2:-all}"
set -a; source .env; set +a
export ECR="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
# 시크릿은 디스크에 두지 않고 Parameter Store 에서 읽는다
export AUTH_SECRET="$(aws ssm get-parameter --region "$AWS_REGION" --name /robotics/auth-secret --with-decryption --query Parameter.Value --output text)"
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$ECR"

# 현재 태그 (.tags: WEB_TAG / RT_TAG). 구버전 .last_tag 도 인식
PREV_WEB=latest; PREV_RT=latest
[ -f .last_tag ] && { PREV_WEB="$(cat .last_tag)"; PREV_RT="$PREV_WEB"; }
[ -f .tags ] && source .tags
NEW_WEB="$PREV_WEB"; NEW_RT="$PREV_RT"
case "$TARGET" in
  all)      NEW_WEB="$TAG"; NEW_RT="$TAG" ;;
  web)      NEW_WEB="$TAG" ;;
  realtime) NEW_RT="$TAG" ;;
  *) echo "unknown target: $TARGET" >&2; exit 2 ;;
esac

healthy() {
  local i
  for i in $(seq 1 30); do
    if docker compose exec -T web node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" 2>/dev/null \
    && docker compose exec -T realtime node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" 2>/dev/null; then
      return 0
    fi
    sleep 2
  done
  return 1
}

up() { export WEB_TAG="$1" RT_TAG="$2"; docker compose pull && docker compose up -d --remove-orphans; }

# realtime 을 갱신하면 스키마 마이그레이션이 돌 수 있으니 DB 를 먼저 일관된 사본으로 떠 둔다 (실패해도 배포는 계속)
if [ "$TARGET" != "web" ]; then
  rm -f /data/realtime/pre-deploy.db
  WEB_TAG="$PREV_WEB" RT_TAG="$PREV_RT" docker compose exec -T realtime node -e "
    const {DatabaseSync}=require('node:sqlite');
    const d=new DatabaseSync(process.env.DB_PATH,{readOnly:true});
    d.exec(\"VACUUM INTO '/data/pre-deploy.db'\");" \
    && echo "db backup: /data/realtime/pre-deploy.db" || echo "db backup skipped" >&2
fi

up "$NEW_WEB" "$NEW_RT"
if healthy; then
  printf 'PREV_WEB=%s\nPREV_RT=%s\n' "$NEW_WEB" "$NEW_RT" > .tags
  docker image prune -f
  echo "deployed web=$NEW_WEB realtime=$NEW_RT"
else
  echo "health check failed (web=$NEW_WEB realtime=$NEW_RT)" >&2
  docker compose logs --tail=50 >&2 || true
  echo "rolling back to web=$PREV_WEB realtime=$PREV_RT" >&2; up "$PREV_WEB" "$PREV_RT" || true
  exit 1
fi
