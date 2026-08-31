# ADR-0007: apps/api ↔ 프런트엔드 공유 코드를 packages/shared로 이관

- 상태: Accepted (DTO 이관은 진행 중 — 현재는 유틸리티만 이관 완료)
- 관련 코드: [`packages/shared`](../../packages/shared), `apps/admin/src/lib/`, `apps/api/src/inquiry/`
- Supersedes: [`ADR-0003`](0003-manual-dto-type-mirroring.md)

## 배경

[`ADR-0003`](0003-manual-dto-type-mirroring.md)은 `apps/api`의 DTO를 `apps/web`/`apps/admin`이 `src/types/`에 수동으로 옮겨 적는 방식을 채택하면서, 워크스페이스 3개 규모에서는 공유 타입 패키지를 구축하는 비용이 수동 동기화의 번거로움보다 크다고 판단했다. 다만 "공유 모듈이 필요해지면 `packages/` 아래에 워크스페이스로 추가한다"는 원칙(루트 `CLAUDE.md`)과 함께, 재검토 조건으로 "공유 타입 패키지 도입 시 최소한 DTO부터 우선 검토"를 남겨두었다.

문의(Inquiry) 검토 Slack 알림([`apps/api/src/inquiry/build-inquiry-review-slack-message.ts`](../../apps/api/src/inquiry/build-inquiry-review-slack-message.ts))을 만들면서, `apps/admin`이 이미 갖고 있던 `withStartSecParam`(유튜브 링크의 `t` 파라미터 계산 - 순수 함수, 프레임워크 의존성 없음) 로직이 `apps/api`에도 똑같이 필요해졌다. ADR-0003 방침대로면 이 함수도 `apps/api`에 그대로 복제해야 했다.

## 결정

`packages/logger`/`packages/tracing`과 같은 패턴으로 `packages/shared` 워크스페이스를 새로 만들고, `apps/api`와 `apps/web`/`apps/admin`이 함께 쓸 수 있는 순수 로직(프레임워크 의존성 없는 타입/유틸리티)을 여기 둔다. 첫 이관 대상으로 `withStartSecParam`을 `apps/admin/src/lib/youtube-url.ts`에서 `packages/shared/src/youtube-url.ts`로 옮기고, `apps/admin`/`apps/api` 양쪽이 `shared` 워크스페이스를 의존성으로 추가해 import한다.

DTO 자체의 이관(ADR-0003이 원래 다루던 범위)은 이 ADR의 범위에 포함하지 않는다 - 이 ADR은 "공유가 필요한 코드가 생기면 `packages/shared`로 보낸다"는 방향 전환만 결정하고, DTO 이관은 별도 작업으로 점진적으로 진행한다.

## 근거

- `packages/logger`/`packages/tracing`이 이미 같은 모노레포 구조로 `apps/api`/`apps/game` 사이의 공유 코드를 문제없이 운영 중이다 - 새 워크스페이스를 추가하는 비용 자체는 이미 검증된 패턴이라 낮다.
- `withStartSecParam`처럼 순수하고 작은 함수는, DTO(런타임 검증 규칙까지 얽힌 타입)와 달리 공유했을 때 리스크가 낮고 이득(로직 분기 방지)이 즉시 명확하다 - "가장 작은 것부터 옮겨보고 패턴을 검증한다"는 점진적 접근으로 택했다.
- OpenAPI 코드젠/tRPC 같은 더 큰 변경은 여전히 채택하지 않는다 - 기존 REST 컨트롤러 구조를 갈아엎는 비용이 크고, `packages/shared`만으로도 지금 필요한 문제(작은 로직 중복)는 해결된다.

## 결과 및 트레이드오프

- `packages/shared`는 `apps/web`/`apps/admin`(브라우저 번들)에서도 import되므로, `packages/logger`/`packages/tracing`과 달리 Node 전용 API나 NestJS 데코레이터를 넣으면 안 된다 - 순수 함수만 유지해야 한다(패키지 `CLAUDE.md`에 명시).
- DTO 이관은 아직 하지 않았다 - `apps/api`가 DTO를 바꾸면 여전히 `apps/web`/`apps/admin`의 `src/types/`를 사람이 함께 맞춰야 한다(ADR-0003의 트레이드오프가 DTO에는 그대로 남아있음).
- 이 패키지에 넣을 만큼 "충분히 공유되는" 코드인지 판단 기준이 아직 느슨하다 - 당장은 프런트엔드/백엔드 양쪽에서 실제로 쓰이는 순수 로직만 옮기고, 한쪽에서만 쓰는 코드는 옮기지 않는다.

## 향후 재검토 조건

DTO도 `packages/shared`로 옮길지는 별도로 재검토한다 - 이관 시 최소한 `apps/api`의 DTO를 `packages/shared`에서 export하고 `apps/web`/`apps/admin`이 그 타입을 import하는 방식을 우선 검토한다(ADR-0003이 원래 남겨둔 재검토 조건과 동일).
