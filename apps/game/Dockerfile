# apps/game 프로덕션 이미지. apps/api/Dockerfile과 동일한 구조 - 배경 설명은 그쪽 주석 참고.
#
#   docker build -f apps/game/Dockerfile -t song-quiz-game .

FROM node:24-slim AS build
WORKDIR /app

COPY . .

RUN corepack enable \
  && YARN_ENABLE_IMMUTABLE_INSTALLS=true yarn workspaces focus game \
  && yarn workspace logger build \
  && yarn workspace tracing build \
  && yarn workspace game build

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/logger/dist ./packages/logger/dist
COPY --from=build /app/packages/logger/package.json ./packages/logger/package.json
COPY --from=build /app/packages/tracing/dist ./packages/tracing/dist
COPY --from=build /app/packages/tracing/package.json ./packages/tracing/package.json
COPY --from=build /app/apps/game/dist ./apps/game/dist
COPY --from=build /app/apps/game/package.json ./apps/game/package.json

WORKDIR /app/apps/game

# 포트는 PORT 환경변수(기본 8002)로 주입한다.
EXPOSE 8002

CMD ["node", "dist/main"]
