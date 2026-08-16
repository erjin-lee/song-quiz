# Backend conventions (apps/api)

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
- 테이블 스키마(컬럼, 인덱스, 코멘트 등)를 확인해야 할 때는 `apps/api/DB_INFO.txt`(전체 테이블 CREATE TABLE DDL 모음, git에는 포함되지 않는 로컬 참조 파일)를 참고한다.
- 기존 API 응답 형식과 공개 인터페이스를 임의로 변경하지 않는다.
- `.env`, `.env.local`에는 실제 자격 증명(AWS, DB, JWT, Firebase 등)이 들어있다. 수정하지 않고, 로그나 응답에 노출하지 않는다.

# Project layout

- `src/main.ts`: 부트스트랩, 포트 설정.
- `src/app/`: 기본 스캐폴드(`app.module.ts`, `app.controller.ts`, `app.service.ts`)이자 도메인 디렉토리 구조의 예시.
- `test/`: e2e 테스트(Jest + supertest).
- 신규 도메인은 `src/<domain>/` 하위에 module/controller/service/dto 구조로 추가한다 (`src/app/` 참고).

# Commands

- API 빌드: `yarn api:build` (루트에서 turbo 필터 실행)
- API 실행(watch): `yarn api`
- API 실행(watch, `.env.local` 로드): `yarn api:local`
- 워크스페이스 내부에서 직접 실행: `yarn workspace api start:dev`, `yarn workspace api start:dev:local`, `yarn workspace api build`, `yarn workspace api test`, `yarn workspace api lint`

# Verification

1. 변경된 파일의 타입 오류를 확인한다.
2. 관련 테스트를 실행한다 (`yarn workspace api test`, e2e는 `yarn workspace api test:e2e`).
3. 영향 범위가 넓으면 API 빌드를 실행한다 (`yarn api:build`).
4. `yarn api:local` 등으로 서버를 직접 띄워 실제 호출까지 테스트했다면, 테스트가 끝난 뒤 해당 프로세스를 종료한다(포트 점유로 인한 EADDRINUSE, 좀비 프로세스 누적을 방지).