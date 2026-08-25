# ADR-0002: 게스트 모드 병행과 JWT localStorage 저장

- 상태: 결정 3(JWT를 `localStorage`에 저장)은 [`ADR-0005`](0005-httponly-cookie-auth.md)로 Superseded. 게스트 모드 병행(결정 1, 2)은 여전히 Accepted.
- 관련 코드: `apps/web/src/context/SessionContext.tsx`, `apps/web/src/api/client.ts`, `apps/api`의 `/auth/login`, `/auth/signup`

## 배경

song-quiz는 친구들끼리 캐주얼하게 즐기는 게임이다. 동시에 닉네임/기록을 유지하고 싶은 사용자를 위한 계정 로그인도 지원해야 한다.

## 결정

1. 로그인 없이도 게스트 닉네임만으로 방을 만들고 참여할 수 있다. 게스트 닉네임은 `localStorage`에 저장한다.
2. `SessionContext`가 게스트 닉네임과 계정 인증 상태를 함께 관리한다. 로그인 상태에서는 게스트 입력값이 아니라 계정 닉네임을 사용한다.
3. ~~로그인 시 `apps/api`가 발급한 JWT를 `localStorage`(`song-quiz:token`)에 저장하고, 모든 REST 요청에 `Authorization: Bearer` 헤더로 첨부한다. `httpOnly` 쿠키는 사용하지 않는다.~~ → [`ADR-0005`](0005-httponly-cookie-auth.md)로 대체(`apps/web`/`apps/api`/`apps/game`은 httpOnly 쿠키 방식으로 전환. `apps/admin`은 아직 이 방식 그대로 유지).

## 근거

- **게스트 모드**: 회원가입 장벽을 없애는 것이 목적이다. 캐주얼 게임 특성상 가입 절차 없이 최대한 빠르게 참여시키는 것을 우선했다.
- **JWT를 localStorage에 저장**: 별도의 보안 트레이드오프 검토를 거쳐 내린 결정이 아니라, 초기 구현 방식을 그대로 유지해 온 것이다. SPA에서 `Authorization` 헤더를 직접 붙이는 방식이 CSRF를 신경 쓸 필요 없이 구현하기 단순했다는 실용적인 이유는 있지만, XSS 노출 위험을 상쇄할 별도 방어(CSP 등)는 갖추고 있지 않다.

## 결과 및 트레이드오프

- XSS 취약점이 발생하면 저장된 토큰이 스크립트에서 그대로 읽혀 탈취될 수 있다. `httpOnly` 쿠키였다면 자바스크립트로 직접 접근할 수 없어 이 경로가 막힌다.
- 반대로 쿠키 자동 첨부 방식이 아니므로 CSRF는 별도로 방어하지 않아도 된다.
- 게스트/계정 두 정체성이 공존해 닉네임 소스가 이중화된다. 새 화면을 추가할 때마다 "게스트 닉네임"과 "계정 닉네임" 중 어느 것을 표시할지 매번 확인해야 한다(`SessionContext`의 `isAuthenticated` 분기 기준).

## 향후 재검토 조건

이 저장 방식은 보안 검토를 거쳐 채택된 것이 아니므로, 다음이 갖춰지기 전까지는 결제·개인정보 조회처럼 더 민감한 기능에 같은 방식(토큰을 `localStorage`에 저장)을 그대로 재사용하지 않는다.

- XSS 방어 강화(CSP 적용, 사용자 입력 출력 시 이스케이프 점검)
- `httpOnly` 쿠키 전환 여부는 이 ADR과 별개로 재논의하고, 채택 시 이 문서를 Superseded로 갱신한다.
