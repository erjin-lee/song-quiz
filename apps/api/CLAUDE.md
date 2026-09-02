# Backend conventions (apps/api)

# Purpose

일반 REST API(퀴즈·유저·문의·관리자)와 데이터 접근을 담당하는 NestJS 백엔드를 소유한다. `apps/web`과 `apps/admin`이 공유하는 백엔드다. 실시간 방(room) 게임 로직/Socket.IO는 `apps/game`이 별도로 소유한다([`ADR-0004`](../../docs/adr/0004-game-service-split.md)) — `apps/game`이 필요로 하는 Quiz/User 데이터는 `src/*/internal/` 아래의 내부 전용 HTTP 엔드포인트로만 노출한다.

- NestJS(Express 플랫폼, `@nestjs/platform-express`) 기반 백엔드 애플리케이션이다.
- 서버 포트는 `8001`이다 (`src/main.ts`에서 `process.env.PORT ?? 8001`). 배포 환경에서 포트를 바꾸려면 `.env`가 아니라 `PORT` 환경 변수로 주입한다.
- 개발 중 `.env.local` 값을 프로세스 환경 변수로 주입하려면 `dotenv-cli`를 사용하는 `start:dev:local` 스크립트(`yarn api:local`)를 쓴다. 앱 코드가 자체적으로 `.env` 파일을 읽어 들이지는 않는다.
- CORS는 전체 허용이 아니라 특정 origin만 허용한다 (`app.enableCors(...)`, `src/main.ts`). `CORS_ORIGIN` 환경 변수(콤마로 여러 origin 구분)로 설정하며, 값이 없거나 빈 문자열이면 기본값으로 `http://localhost:5173`과 `https://noraemat.site`를 허용한다.
- 워크스페이스 이름은 `api`이며, 빌더는 tsc 기반 Nest CLI(`nest build`)를 사용한다 (webpack 미사용).
- Controller는 요청 검증과 응답 전달만 담당한다.
- 비즈니스 로직은 Service에 작성한다.
- 데이터 접근 로직은 기존 Repository 패턴을 따른다.
- DTO에는 class-validator를 사용한다.
- 트랜잭션이 필요한 경우 실패 시 rollback과 release 경로를 확인한다.
- DB 쿼리 변경 시 N+1과 인덱스 영향을 확인한다.
- 테이블 스키마(컬럼, 인덱스, 코멘트 등)를 확인해야 할 때는 `apps/api/DB_INFO.txt`(전체 테이블 CREATE TABLE DDL 모음, git에는 포함되지 않는 로컬 참조 파일)를 참고한다. "지금 스키마가 어떤지"는 이 파일이, "왜/언제 바뀌었는지"는 `src/migrations/`의 마이그레이션 파일이 담당한다.
- 기존 API 응답 형식과 공개 인터페이스를 임의로 변경하지 않는다.
- `.env`, `.env.local`에는 실제 자격 증명(AWS, DB, JWT, Firebase 등)이 들어있다. 수정하지 않고, 로그나 응답에 노출하지 않는다.

# Project layout

- `src/main.ts`: 부트스트랩, 포트 설정.
- `src/app/`: 기본 스캐폴드(`app.module.ts`, `app.controller.ts`, `app.service.ts`)이자 도메인 디렉토리 구조의 예시.
- `test/`: e2e 테스트(Jest + supertest).
- 신규 도메인은 `src/<domain>/` 하위에 module/controller/service/dto 구조로 추가한다 (`src/app/` 참고).

# Patterns

- 신규 도메인 추가: `src/<domain>/` 아래 module/controller/service/dto 구조로 만든다(`src/app/` 참고).
- 비즈니스 로직 변경: Controller가 아니라 Service에 작성한다. Controller는 요청 검증과 응답 전달만 담당한다.
- DB 쿼리 변경: N+1과 인덱스 영향을 확인하고, 필요하면 `apps/api/DB_INFO.txt`로 스키마를 먼저 확인한다.
- DB 스키마 변경(컬럼/테이블 추가·변경 등): 엔티티를 먼저 수정한 뒤 `yarn workspace api migration:generate src/migrations/<이름>`으로 DDL diff를 생성하고, 생성된 `up()`/`down()`을 리뷰한 뒤 커밋한다(자세한 흐름은 아래 Migrations 참고).
- 외부 입력을 다루는 로직 변경(사용자 제출 URL, 스크래핑 결과, GPT 등 AI 응답): 호스트/경로/범위 등 형식을 검증하고, 검증에 실제로 쓰인 값과 저장·응답에 쓰이는 값이 같은 소스에서 파생되는지 확인한다. AI 판정 결과가 사람 검토 없이 자동 실행/승인으로 이어지는 경로라면, 그 판정이 프롬프트를 어겨도 안전하도록 코드에서 한 번 더 상한을 둔다(설계 배경: [`ADR-0009`](../../docs/adr/0009-change-link-verification-trust-boundary.md)).

# Dependencies

- 소비자: `apps/web`(일반 REST, 로그인 세션은 `sq_session` httpOnly 쿠키), `apps/admin`(REST, Admin JWT는 여전히 `sessionStorage` + `Authorization` 헤더 방식 — [`ADR-0005`](../../docs/adr/0005-httponly-cookie-auth.md) 범위 밖), `apps/game`(내부 전용 `/internal/*` 엔드포인트로 Quiz/User 데이터 조회). DTO를 변경하면 프런트엔드 `src/types/`를 함께 확인한다(DTO 자체는 아직 [`packages/shared`](../../packages/shared)로 옮기지 않았다 — [`ADR-0007`](../../docs/adr/0007-shared-package-for-cross-app-code.md) 참고).
- `apps/admin`과 공유하는 프레임워크 비의존 순수 유틸리티(예: 유튜브 링크의 `t` 파라미터 계산)는 각 앱에 복제하지 않고 [`packages/shared`](../../packages/shared)에 추가한다.
- 로그인 JWT는 `POST /auth/login`/`/auth/signup` 응답 바디가 아니라 `httpOnly` 쿠키(`sq_session`, `src/common/auth-cookie.util.ts`)로만 내려간다. `UserAuthGuard`는 `Authorization` 헤더가 아니라 이 쿠키를 읽는다. `POST /auth/logout`이 쿠키를 지운다.
- `apps/game`이 호출하는 `/internal/*` 엔드포인트는 `InternalAuthGuard`(`src/common/internal-auth.guard.ts`)로 보호되며, `INTERNAL_SERVICE_SECRET` 헤더(`x-internal-secret`)가 apps/game과 일치해야 통과한다. 이 내부 호출 자체는 여전히 `Authorization: Bearer` 헤더 계약을 쓴다(apps/game이 자신이 받은 쿠키에서 값을 꺼내 헤더로 재구성해 전달).
- 외부 연동: OpenAI API(GPT 채점), YouTube(영상 스크래핑), Melon 차트(곡 정보). 전체 그래프는 [`ARCHITECTURE.md`](../../ARCHITECTURE.md) 참고.
- 설계 배경: room 실시간 상태([`ADR-0001`](../../docs/adr/0001-room-realtime-state-and-reconnect.md)), 게스트 모드/JWT 저장([`ADR-0002`](../../docs/adr/0002-guest-mode-and-jwt-storage.md)), DTO 미러링([`ADR-0003`](../../docs/adr/0003-manual-dto-type-mirroring.md)), Game 서비스 분리([`ADR-0004`](../../docs/adr/0004-game-service-split.md)), httpOnly 쿠키 전환([`ADR-0005`](../../docs/adr/0005-httponly-cookie-auth.md)), 문의 조치 재승인/원자적 상태 검증([`ADR-0008`](../../docs/adr/0008-inquiry-action-reapproval-and-atomic-guard.md)), CHANGE_LINK 검증의 AI 신뢰 경계/URL 정규화([`ADR-0009`](../../docs/adr/0009-change-link-verification-trust-boundary.md)).

# Commands

- API 빌드(루트에서 turbo 필터 실행)
```bash
yarn api:build
```

- API 실행(watch)
```bash
yarn api
```

- API 실행(watch, `.env.local` 로드)
```bash
yarn api:local
```

- 워크스페이스 내부에서 직접 실행
```bash
yarn workspace api start:dev
yarn workspace api start:dev:local
yarn workspace api build
yarn workspace api test
yarn workspace api lint
```

# Migrations

TypeORM 공식 마이그레이션(`src/data-source.ts`, `src/migrations/`)을 쓴다. `app.module.ts`의 `TypeOrmModule.forRoot()`는 `synchronize: false`를 그대로 유지하고, 앱 부팅 시 마이그레이션을 자동 실행하지도 않는다(ECS가 태스크를 여러 개 띄울 수 있어 부팅 시점 동시 실행 경쟁을 피하고, 스키마 변경을 배포 타이밍과 분리해 항상 의도적으로만 실행하기 위함). 적용은 지금까지처럼 `scripts/tunnel-db.sh`로 bastion을 거쳐 DB에 직접 붙어서 사람이 실행한다 - CI(`deploy-api.yml`)는 자동으로 마이그레이션을 실행하지 않는다(RDS가 private 서브넷이라 GitHub Actions가 애초에 못 닿는다).

```bash
# 1) 엔티티 수정
# 2) 다른 터미널에서 bastion 터널을 연다
infra/terraform/environments/prod/scripts/tunnel-db.sh
# 3) .env.local의 DB_HOST_NAME/DB_PORT가 터널 쪽(127.0.0.1:<로컬 포트>)을 가리키는 상태에서
yarn workspace api migration:generate src/migrations/<설명적인이름>
# 4) 생성된 파일의 up()/down() SQL을 리뷰(코드 리뷰와 동일한 감각) 후 커밋 + PR
# 5) merge 후 실제 DB에 반영할 시점에 사람이 직접
yarn workspace api migration:run
```

기타 명령:
```bash
yarn workspace api migration:show      # 적용/미적용 마이그레이션 목록
yarn workspace api migration:revert    # 마지막 마이그레이션 되돌리기
yarn workspace api migration:create src/migrations/<이름>   # DB 접속 없이 빈 마이그레이션 파일만 생성(수기 DDL이 필요할 때)
```

# Verification

1. 변경된 파일의 타입 오류를 확인한다.
2. 관련 테스트를 실행한다 (`yarn workspace api test`, e2e는 `yarn workspace api test:e2e`).
3. 영향 범위가 넓으면 API 빌드를 실행한다 (`yarn api:build`).
4. `yarn api:local` 등으로 서버를 직접 띄워 실제 호출까지 테스트했다면, 테스트가 끝난 뒤 해당 프로세스를 종료한다(포트 점유로 인한 EADDRINUSE, 좀비 프로세스 누적을 방지).