# Shared cross-app code (packages/shared)

# Purpose

`apps/api`와 `apps/web`/`apps/admin` 사이에서 공유할 순수 로직(프레임워크 의존성 없는 타입, 유틸리티)을 소유한다. 워크스페이스 이름은 `shared`.

[`ADR-0007`](../../docs/adr/0007-shared-package-for-cross-app-code.md)에 따라, `apps/api`의 DTO를 프런트엔드(`apps/web`/`apps/admin`)가 수동으로 미러링하던 [`ADR-0003`](../../docs/adr/0003-manual-dto-type-mirroring.md) 방식을 이 패키지로 점진적으로 대체하는 중이다. 첫 이관 대상은 DTO가 아니라 `withStartSecParam`(유튜브 링크의 `t` 파라미터 계산) 같은 소소한 순수 유틸리티다 — DTO 이관은 후속 작업이다.

- `withStartSecParam`: 유튜브 URL의 `t`(재생 시작 초) 쿼리 파라미터를 교체한다. `apps/admin`(문의 검토 링크), `apps/api`(Slack 알림 링크)가 함께 쓴다.

# Dependencies

- `packages/logger`/`packages/tracing`과 달리 `apps/web`/`apps/admin`(브라우저 번들) 쪽에서도 import될 수 있다 — Node 전용 API(`fs`, `process.env` 등)나 NestJS 데코레이터를 여기 추가하지 않는다. 순수 함수만 둔다.
- 여기 코드를 바꾸면 `apps/api`뿐 아니라 `apps/admin`/`apps/web` 빌드에도 영향을 줄 수 있으므로, 변경 후 관련 앱들의 타입 체크/테스트를 함께 확인한다.

# Commands

```bash
yarn workspace shared build
yarn workspace shared test
yarn workspace shared lint
```

# Verification

1. 이 패키지를 수정하면 실제로 이 코드를 쓰는 앱(`apps/api`, `apps/admin` 등)의 관련 테스트도 함께 확인한다.
2. 새 함수를 추가할 때 Node 전용 API나 브라우저 전용 API(예: `window`)에 의존하지 않는지 확인한다 — 두 런타임 모두에서 import될 수 있다.
