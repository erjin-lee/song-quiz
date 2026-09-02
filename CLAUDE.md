# Project

Yarn 4(Berry) + Turborepo 기반 TypeScript 모노레포다.

주요 워크스페이스:
- `apps/api`: NestJS 백엔드(일반 REST API — 퀴즈/유저/문의/관리자)
- `apps/game`: NestJS 백엔드(실시간 게임 서버 — room, Socket.IO `/rooms`)
- `apps/web`: Vite + React 사용자 웹
- `apps/admin`: Next.js 관리자 웹
- `packages/`: 공유 워크스페이스

`apps/api`와 `apps/game`은 서로 다른 프로세스로 배포되는 별도 서비스다. 의존 관계와 서비스 경계는 [`ARCHITECTURE.md`](ARCHITECTURE.md)와 [`docs/adr/0004-game-service-split.md`](docs/adr/0004-game-service-split.md)를 따른다.

패키지 매니저는 Yarn만 사용한다. Yarn 버전은 루트 `package.json`의 `packageManager`를 source of truth로 삼는다.

# Required context

작업 전에 관련 문서를 확인한다.

- 시스템 구조와 의존 관계: [`ARCHITECTURE.md`](ARCHITECTURE.md)
- 공통 개발 원칙: [`docs/engineering-principles.md`](docs/engineering-principles.md)
- Git 및 검증 규칙: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- 코드만 봐서는 알 수 없는 설계 결정의 배경: [`docs/adr/`](docs/adr/README.md)
- 새 기능 기획/설계 문서와 작업 진행 현황: [`docs/features/`](docs/features/README.md)
- AI 에이전트 성능 벤치마크: [`evals/README.md`](evals/README.md) — Claude Code agent session 결과를 `evals/results/agent-results.json`에 기록해 pass rate를 추적한다.

앱을 수정할 때는 해당 앱의 규칙도 따른다.

- API: [`apps/api/CLAUDE.md`](apps/api/CLAUDE.md)
- Game: [`apps/game/CLAUDE.md`](apps/game/CLAUDE.md)
- Web: [`apps/web/CLAUDE.md`](apps/web/CLAUDE.md)
- Admin: [`apps/admin/CLAUDE.md`](apps/admin/CLAUDE.md)
- Lambda: [`apps/lambda/CLAUDE.md`](apps/lambda/CLAUDE.md)
- 공유 로깅: [`packages/logger/CLAUDE.md`](packages/logger/CLAUDE.md)
- 공유 트레이싱: [`packages/tracing/CLAUDE.md`](packages/tracing/CLAUDE.md)
- 유지보수 스크립트: [`scripts/CLAUDE.md`](scripts/CLAUDE.md)

# Working rules

- 설명, 질문, 작업 결과는 한국어로 작성한다.
- 타입 오류를 `any`나 불필요한 타입 단언으로 회피하지 않는다.
- 요청과 직접 관련된 부분만 수정한다.
- 파일 위치를 안내할 때는 Cmd/Ctrl+클릭으로 바로 열 수 있도록 파일 경로에 Markdown 링크를 건다.

# Commands

- 의존성 설치
```bash
yarn install
```

- 전체 테스트
```bash
yarn test
```

- 변경 확인
```bash
git diff --stat && git diff
```
- 앱별 명령은 해당 앱의 `CLAUDE.md`를 따른다.

# Prohibited actions

- `.env`, `.env.local` 파일을 수정하거나 내용을 출력하지 않는다.
- 요청 없이 패키지를 추가하거나 삭제하지 않는다.
- 요청 없이 Git commit, push, reset을 실행하지 않는다.
- AWS 운영 리소스에 변경 명령을 실행하지 않는다.
- 자격 증명, 토큰, 개인정보를 로그나 응답에 노출하지 않는다.