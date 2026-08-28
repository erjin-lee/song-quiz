# apps/api 프로덕션 이미지. ECS Fargate 이관 1단계(docs/infra/ecs-fargate-migration-plan.md) -
# 아직 어떤 배포에도 연결되지 않고, ECR push까지만 검증하는 용도다.
#
# 빌드 컨텍스트는 리포지토리 루트여야 한다(모노레포 전체가 필요) - 아래처럼 빌드한다:
#   docker build -f apps/api/Dockerfile -t song-quiz-api .
#
# 모노레포 전체를 COPY하는 이유: yarn workspaces focus가 대상 워크스페이스(api)뿐 아니라
# 그 워크스페이스가 의존하는 다른 워크스페이스(logger, tracing)의 package.json도
# 참조해야 의존성 그래프를 올바르게 계산한다 - 일부만 골라 복사하면 immutable install이
# 깨진다. glibc 기반(node:20-slim)을 쓰는 이유: bcrypt(네이티브 addon)가 musl(alpine)용
# 프리빌드 바이너리를 제공하지 않아 alpine에서는 빌드 툴체인을 추가로 설치해야 한다 -
# slim이 이미지도 크게 무겁지 않으면서 이 문제를 피해간다.

FROM node:20-slim AS build
WORKDIR /app

COPY . .

# CI(.github/workflows/deploy-api.yml)의 build_api()와 동일한 순서를 그대로 따른다 -
# 배포 방식(EC2 PM2 vs 컨테이너)이 달라져도 빌드 절차 자체는 하나만 유지한다.
RUN corepack enable \
  && YARN_ENABLE_IMMUTABLE_INSTALLS=true yarn workspaces focus api \
  && yarn workspace logger build \
  && yarn workspace tracing build \
  && yarn workspace api build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# 루트에서 하나로 hoist된 node_modules를 그대로 옮긴다(nodeLinker: node-modules) -
# packages/logger, packages/tracing으로의 상대경로 symlink가 깨지지 않도록 원래와
# 같은 디렉토리 구조(/app/packages/*, /app/apps/api)를 runtime 스테이지에도 유지한다.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/logger/dist ./packages/logger/dist
COPY --from=build /app/packages/logger/package.json ./packages/logger/package.json
COPY --from=build /app/packages/tracing/dist ./packages/tracing/dist
COPY --from=build /app/packages/tracing/package.json ./packages/tracing/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json

WORKDIR /app/apps/api

# apps/api/CLAUDE.md: 서버 포트는 PORT 환경변수(기본 8001)로 주입한다. 앱이 .env 파일을
# 직접 읽지 않으므로(dotenv 미사용) 컨테이너 런타임 환경변수만으로 설정이 끝난다 -
# PM2 배포의 `node_args: ['-r', 'dotenv/config']`는 여기서 쓰지 않는다.
EXPOSE 8001

CMD ["node", "dist/main"]
