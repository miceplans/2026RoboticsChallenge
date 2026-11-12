#!/bin/bash
# 서버(EC2)에서 실행. 사용: deploy.sh <TAG>   (SSM 으로 GitHub Actions 가 호출)
# 새 태그로 올린 뒤 헬스체크 실패하면 직전 태그로 되돌리고 실패(exit 1)한다.
set -euo pipefail
cd /opt/app
TAG="${1:-latest}"
set -a; source .env; set +a
export ECR="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
# 시크릿은 디스크에 두지 않고 Parameter Store 에서 읽는다
export AUTH_SECRET="$(aws ssm get-parameter --region "$AWS_REGION" --name /robotics/auth-secret --with-decryption --query Parameter.Value --output text)"
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$ECR"

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

up() { TAG="$1" docker compose pull && TAG="$1" docker compose up -d --remove-orphans; }

PREV="$(cat .last_tag 2>/dev/null || true)"
up "$TAG"
if healthy; then
  echo "$TAG" > .last_tag
  docker image prune -f
  echo "deployed $TAG"
else
  echo "health check failed for $TAG" >&2
  docker compose logs --tail=50 >&2 || true
  if [ -n "$PREV" ]; then echo "rolling back to $PREV" >&2; up "$PREV" || true; fi
  exit 1
fi
