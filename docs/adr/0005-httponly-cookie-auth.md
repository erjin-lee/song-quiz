# ADR-0005: 로그인 JWT를 httpOnly 쿠키로 전환

- 상태: Accepted
- 관련 코드: `apps/web/src/api/client.ts`, `apps/web/src/api/auth.ts`, `apps/web/src/context/SessionContext.tsx`, `apps/api/src/common/auth-cookie.util.ts`, `apps/api/src/common/same-origin.guard.ts`, `apps/api/src/common/cors-origins.util.ts`, `apps/api/src/user/user-auth.controller.ts`, `apps/api/src/user/guards/user-auth.guard.ts`, `apps/game/src/common/auth-cookie.util.ts`, `apps/game/src/room/room.controller.ts`
- Supersedes: [`ADR-0002`](0002-guest-mode-and-jwt-storage.md)의 결정 3(JWT `localStorage` 저장)

## 배경

ADR-0002는 로그인 JWT를 `localStorage`에 저장하고 모든 REST 요청에 `Authorization: Bearer` 헤더로 첨부하는 방식을, "별도 보안 검토 없이 유지되어 온 결정"이라고 명시하며 재검토 대상으로 남겨두었다. `localStorage`는 JS로 읽을 수 있으므로, XSS가 한 번이라도 발생하면 저장된 토큰이 그대로 탈취될 수 있다.

## 결정

1. `apps/api`가 로그인/회원가입 시 발급하는 JWT를 응답 바디가 아니라 `httpOnly` 쿠키(`sq_session`)로만 내려준다. `secure`(프로덕션 한정), `sameSite: 'lax'`, `path: '/'` 속성을 쓰고, `COOKIE_DOMAIN` 환경변수(예: `.noraemat.site`)로 상위 도메인 범위를 지정한다.
2. `apps/web`은 더 이상 토큰을 저장하거나 `Authorization` 헤더를 직접 붙이지 않는다. 모든 `fetch` 호출에 `credentials: 'include'`만 추가해 브라우저가 쿠키를 자동으로 첨부하게 한다.
3. `apps/api`는 `Authorization` 헤더 대신 `Cookie` 헤더에서 `sq_session` 값을 읽어 검증한다(`user-auth.guard.ts`). 새 `POST /auth/logout` 엔드포인트가 쿠키를 지운다.
4. `apps/game`은 브라우저로부터 받은 요청의 쿠키에서 토큰을 꺼내, `apps/api`의 내부 엔드포인트(`/internal/auth/resolve-account-user`)를 호출할 때는 기존과 동일하게 `Authorization: Bearer` 헤더 형태로 만들어 전달한다 — 서비스 간 계약은 바꾸지 않는다.
5. `POST /auth/signup`, `/auth/login`, `/auth/logout`은 세션 쿠키를 발급/삭제하는 요청이라 아직 쿠키 자체로는 자신을 증명할 수 없다. `SameOriginGuard`(`apps/api/src/common/same-origin.guard.ts`)로 `Origin` 헤더가 CORS 허용 목록에 있는지 검증해, 공격자 사이트의 폼 자동 제출로 피해자를 공격자 계정에 강제 로그인시키는 로그인 CSRF를 막는다.
6. **범위에서 제외**:
   - `apps/admin`: Terraform/배포 워크플로우에 도메인 정보가 없어 `apps/web`/`apps/api`/`apps/game`과 같은 상위 도메인(`*.noraemat.site`)을 쓰는지 이 리포지토리 안에서 확인할 수 없다. 도메인이 확정되기 전까지는 기존 `sessionStorage` + `Authorization` 헤더 방식을 그대로 유지한다.
   - room 재입장 토큰(`apps/web/src/utils/roomSession.ts`의 `accessToken`, `apps/game`의 `computeMembershipToken`): 로그인 JWT와 무관한 별개의 방(room) 단위 자격증명이다. 클라이언트가 `socket.emit('room:enter', { accessToken, ... })`처럼 페이로드에 값을 직접 실어 보내야 해서 JS가 값을 읽을 수 있어야 한다. `httpOnly`로 바꾸면 이 프로토콜 자체가 깨지므로 대상에서 제외한다.

## 근거

- **XSS 탈취 경로 차단**: `httpOnly` 쿠키는 JS에서 아예 읽을 수 없다. XSS가 발생해도 스크립트가 토큰 값을 훔쳐 다른 곳으로 유출할 수 없다(단, XSS로 같은 오리진에서 인증된 요청을 그대로 보내는 것 자체는 막지 못한다 — 그건 CSP 등 별도 방어 영역이다).
- **이미 로그인된 세션에 대해서는 별도 CSRF 토큰을 두지 않은 이유**: `apps/web`(`noraemat.site`)/`apps/api`(`api.noraemat.site`)/`apps/game`(`game.noraemat.site`)은 모두 같은 상위 도메인(eTLD+1) 아래 있어 서로 간 요청은 브라우저 기준 "same-site"다. `sameSite: 'lax'` 쿠키는 이 요청들에는 그대로 첨부되지만, 외부(cross-site) 사이트가 몰래 보내는 요청에는 첨부되지 않는다. 즉 이미 쿠키를 가진 상태에서의 상태 변경 요청은 SameSite=Lax만으로 방어된다.
- **로그인/회원가입/로그아웃은 별도로 `SameOriginGuard`가 필요한 이유**: SameSite는 "이미 있는 쿠키를 요청에 붙일지"를 결정할 뿐, 쿠키가 아직 없는 로그인 요청 자체가 공격자 사이트에서 오는 것까지는 막지 못한다. 공격자가 자신의 로그인 정보로 `<form method="POST" action="https://api.noraemat.site/auth/login">`을 피해자 브라우저에서 자동 제출하면, CORS는 응답을 JS로 읽는 것만 막을 뿐 폼 제출 자체나 그에 대한 `Set-Cookie` 저장은 막지 않아 피해자가 공격자 계정으로 로그인돼 버린다("로그인 CSRF"). GET/HEAD가 아닌 요청에는 브라우저가 same-origin이어도 `Origin` 헤더를 싣기 때문에(Fetch 표준), 이 헤더가 CORS 허용 목록에 있는지만 확인해도 정상 요청은 통과시키면서 이 공격은 막을 수 있다.
- **`cookie-parser` 패키지를 추가하지 않은 이유**: `res.cookie()`/`res.clearCookie()`는 Express 코어 기능이라 미들웨어 없이 동작한다. 들어오는 요청의 `Cookie` 헤더에서 값 하나를 꺼내는 데는 작은 파서 함수로 충분해, 패키지를 새로 추가하지 않았다(`apps/api/src/common/auth-cookie.util.ts`, `apps/game/src/common/auth-cookie.util.ts` — 서비스가 분리돼 있어 그대로 복제).

## 결과 및 트레이드오프

- `LoginResponseDto`(`POST /auth/signup`, `/auth/login` 응답)에서 `accessToken` 필드가 제거됐다 — API 응답 계약 변경이다. 이 시점 기준 유일한 소비자는 `apps/web`이라 영향은 한정적이다.
- 로그인 세션이 web/api/game 간 실제로 공유되려면 배포 환경에 `COOKIE_DOMAIN`(예: `.noraemat.site`)이 설정돼 있어야 한다. 이 값이 실제 배포 파이프라인 어디서 주입되는지는 리포지토리 안에서 확인할 수 없었다(`CORS_ORIGIN`도 마찬가지) — 배포 담당자가 EC2/PM2 환경변수에 추가해야 한다.
- `apps/admin`은 이번 전환 대상이 아니라서 여전히 ADR-0002의 트레이드오프(XSS 시 토큰 탈취 가능)를 그대로 안고 있다.

## 향후 재검토 조건

- `apps/admin`의 실제 배포 도메인이 `*.noraemat.site` 하위로 확정되면, 같은 방식(httpOnly 쿠키)으로 확장하는 것을 검토한다.
- room 재입장 토큰까지 손대려면 room 입장 프로토콜 자체(Socket.IO payload로 토큰을 보내는 방식)를 재설계해야 한다 — 별도 ADR로 다룬다.
