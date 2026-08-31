# ADR-0003: apps/api DTO의 수동 타입 미러링

- 상태: "공유 패키지를 도입할지"에 대한 방향 결정은 [0007](0007-shared-package-for-cross-app-code.md)로 Superseded(`packages/shared` 도입 확정). 다만 DTO 자체의 이관은 아직 하지 않아, 이 문서가 설명하는 수동 미러링 관행은 DTO에 한해 계속 유효하다 - DTO 이관은 ADR-0007의 "향후 재검토 조건"에서 별도로 다룬다.
- 관련 코드: `apps/web/src/types/`, `apps/admin/src/types/`, `apps/api`의 각 도메인 `dto/`

## 배경

`apps/web`과 `apps/admin`은 각각 독립된 워크스페이스로, `apps/api`가 반환하는 DTO 형식에 맞춰 프런트엔드 타입을 써야 한다. 현재는 두 프런트엔드 모두 `src/types/`에 `apps/api`의 DTO를 사람이 보고 그대로 옮겨 적는(수동 미러링) 방식을 쓰고 있다. `apps/api`에서 DTO를 변경해도 컴파일 타임에 프런트엔드 타입과의 불일치를 잡아주는 장치는 없다.

## 결정

OpenAPI 코드젠, tRPC, 공유 타입 패키지(`packages/`) 등은 아직 도입하지 않고, 각 프런트엔드가 `apps/api`의 DTO를 수동으로 미러링하는 현재 방식을 유지한다.

## 근거

워크스페이스 3개(`admin`/`api`/`web`) 규모에서 코드젠 파이프라인이나 공유 패키지를 구축하는 비용이 지금까지는 수동 동기화의 번거로움보다 크다고 판단했다. 공유 모듈이 필요해지면 `packages/` 아래에 워크스페이스로 추가한다는 원칙은 루트 `CLAUDE.md`에도 이미 명시되어 있다.

## 결과 및 트레이드오프

DTO가 바뀌면 `apps/api` / `apps/web` / `apps/admin` 세 곳을 각각 사람이 맞춰야 한다. 하나라도 놓치면 타입 체크를 통과한 채로 런타임에만 드러나는 타입 불일치가 생긴다 — 실제로 이 문제로 버그가 발생한 적이 있다.

## 향후 재검토 조건

공유 타입 패키지(`packages/`) 도입을 검토 중이다. 도입하게 되면 최소한 `apps/api`의 DTO를 `packages/`에서 export하고 `apps/web`·`apps/admin`이 그 타입을 import하는 방식으로 전환하는 것을 우선 검토한다. 도입이 결정되면 이 ADR은 Superseded로 갱신한다.
