# 실시간 점수 서버 (Node 24 내장 TS 실행 + node:sqlite)
FROM node:24-slim
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production PORT=4000 DB_PATH=/data/scores.db
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY src ./src
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 4000
CMD ["node", "src/index.ts"]
