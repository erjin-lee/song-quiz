# Frontend conventions (apps/web)

# Purpose

게스트/로그인 사용자가 방을 만들고 실시간으로 퀴즈를 플레이하는 화면(SPA)을 소유한다.

- Vite + React + TypeScript 기반 SPA다 (`@vitejs/plugin-react`, react-jsx, ESLint flat config).
- 개발 서버 포트는 `5173`이다 (`vite.config.ts`의 `server.port`, `strictPort: true`). 백엔드(`apps/api`, 8001)와 겹치지 않는다.
- 워크스페이스 이름은 `web`이며, 빌드는 `tsc -b && vite build`로 타입 체크와 번들링을 함께 수행한다.
- 라우팅은 `react-router-dom`(v7, `BrowserRouter`)을 사용한다.
- 스타일링은 Tailwind CSS v4를 `@tailwindcss/vite` 플러그인으로 사용한다 (`postcss.config`/`tailwind.config.js` 없이 `vite.config.ts`에 플러그인만 등록, `src/index.css`에서 `@import 'tailwindcss'`).
- 상태 관리는 별도 라이브러리 없이 React Context(`src/context/SessionContext.tsx`)와 페이지별 로컬 state로 처리한다. 방(room) 입장 직후의 `room`/`userId`/`accessToken`은 `react-router-dom`의 location state로 다음 페이지에 전달하는 동시에 `src/utils/roomSession.ts`로 `localStorage`에도 저장한다. 새로고침 등으로 location state가 사라지면 저장된 값으로 재입장한다(배경: [`docs/adr/0001-room-realtime-state-and-reconnect.md`](../../docs/adr/0001-room-realtime-state-and-reconnect.md)).
- 로그인 없이도 게임을 이용할 수 있다(게스트 모드). 로그인은 선택 사항이며, `SessionContext`가 게스트 닉네임(`localStorage`)과 계정 인증 상태를 함께 관리한다: 로그인 시 `apps/api`의 `POST /auth/login`(회원가입은 `POST /auth/signup`)이 발급하는 JWT는 `httpOnly` 쿠키(`sq_session`)로만 내려오고 JS에서는 접근할 수 없다 — 마운트 시 항상 `GET /auth/me`를 호출해 로그인 여부를 판단한다(배경: [`ADR-0005`](../../docs/adr/0005-httponly-cookie-auth.md)). 로그인 상태의 `nickname`은 게스트 입력값이 아니라 계정 닉네임을 사용한다.
- 백엔드 REST 호출은 `src/api/client.ts`의 공통 fetch 래퍼를 통해서만 한다: 일반 API는 `apiGet`/`apiPost`/`apiPatch`(`apps/api`, `VITE_API_BASE_URL`, 없으면 `http://localhost:8001`), Room REST는 `gameGet`/`gamePost`/`gamePatch`(`apps/game`, `VITE_GAME_BASE_URL`, 없으면 `http://localhost:8002`)를 쓴다. 모든 요청에 `credentials: 'include'`가 붙어 세션 쿠키가 자동으로 첨부된다(수동으로 `Authorization` 헤더를 붙이지 않는다).
- 채팅/방 상태 실시간 갱신은 `socket.io-client`로 `apps/game`의 `/rooms` 네임스페이스(`VITE_GAME_BASE_URL`)에 연결한다 (`src/api/socket.ts`).
- 컴포넌트와 비즈니스 로직(hooks)을 분리한다.
- API 응답 타입은 `apps/api`의 DTO/응답 형식과 어긋나지 않게 유지한다 (`src/types/`에 DTO를 그대로 미러링).
- 기존 API 응답 형식에 맞춰 프론트엔드 타입을 임의로 확장하지 않는다.

# Project layout

- `src/pages/`: 화면 단위 컴포넌트.
- `src/components/`: 재사용 UI 컴포넌트.
- `src/context/`: 전역 상태.
- `src/api/`: REST 및 Socket.IO 백엔드 연동.
- `src/types/`: `apps/api`의 DTO를 미러링한 타입.
- `/rooms/new` 라우트는 `/rooms/:roomId`보다 먼저 선언해야 한다.
- 테스트 러너는 Vitest + React Testing Library다. 테스트 파일은 대상 파일 옆에 `*.test.ts`/`*.test.tsx`로 둔다(예: `src/utils/roomSession.ts` → `src/utils/roomSession.test.ts`). 공통 설정은 `vite.config.ts`의 `test` 필드와 `src/test/setup.ts`(jest-dom 매처, RTL `cleanup`)에 있다.

# Patterns

- 새 화면 추가: `src/pages/`에 페이지 컴포넌트를 만들고, 재사용 UI는 `src/components/`로 분리한다.
- `apps/api` 응답 타입이 바뀌면 `src/types/`를 함께 갱신한다(수동 미러링 배경: [`ADR-0003`](../../docs/adr/0003-manual-dto-type-mirroring.md)).

# Dependencies

- `apps/api`(일반 REST)와 `apps/game`(Room REST + Socket.IO `/rooms`)에 각각 세션 쿠키(`sq_session`)로 의존한다. 전체 그래프는 [`ARCHITECTURE.md`](../../ARCHITECTURE.md) 참고.
- 설계 배경: room 재접속([`ADR-0001`](../../docs/adr/0001-room-realtime-state-and-reconnect.md)), 게스트 모드/JWT 저장([`ADR-0002`](../../docs/adr/0002-guest-mode-and-jwt-storage.md)), DTO 미러링([`ADR-0003`](../../docs/adr/0003-manual-dto-type-mirroring.md)), Game 서비스 분리([`ADR-0004`](../../docs/adr/0004-game-service-split.md)), httpOnly 쿠키 전환([`ADR-0005`](../../docs/adr/0005-httponly-cookie-auth.md)).

# Commands

- Web 빌드(루트에서 turbo 필터 실행)
```bash
yarn web:build
```

- Web 개발 서버
```bash
yarn web
```

- 워크스페이스 내부에서 직접 실행
```bash
yarn workspace web dev
yarn workspace web build
yarn workspace web lint
yarn workspace web test
yarn workspace web test:watch
yarn workspace web test:cov
```

# Verification

1. 변경된 파일의 타입 오류를 확인한다 (`yarn workspace web build`는 `tsc -b`를 포함한다).
2. 관련 테스트가 있으면 실행한다.
3. 영향 범위가 넓으면 Web 빌드를 실행한다 (`yarn web:build`).
