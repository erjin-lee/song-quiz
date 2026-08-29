# ADR-0006: Game multi-instance 환경에서 ALB sticky session을 쓰지 않는다

- 상태: Accepted
- 관련 코드: `apps/web/src/api/socket.ts`, `apps/game/src/common/redis-io.adapter.ts`, `apps/game/src/main.ts`, `apps/game/src/room/room.gateway.ts`, `infra/terraform/modules/load_balancer`(`game_ecs` 타겟그룹), [`docs/infra/ecs-fargate-migration-plan.md`](../infra/ecs-fargate-migration-plan.md) 4단계

## 배경

ECS Fargate 이관 계획(`docs/infra/ecs-fargate-migration-plan.md`)의 "체크 — Game multi-instance 부하 테스트" 단계는, `apps/game`을 EC2 단일 인스턴스에서 ECS Fargate(여러 Task, `desired_count`로 확장 가능)로 옮기기 전에 실제 multi-instance 환경에서 Socket.IO/room 상태가 정상 동작하는지 검증하도록 요구했다.

room은 Redis 기반 상태·분산 락·타이머를 이미 쓰고 있어([ADR-0001](0001-room-realtime-state-and-reconnect.md)) "상태가 Redis에 있으니 인스턴스가 늘어나도 문제없다"고 단정하기 쉽지만, 이는 별개의 두 문제를 섞은 판단이다.

- **상태 공유**: room 레코드/락/타이머 — Redis에 있으므로 인스턴스가 달라도 같은 상태를 본다.
- **커넥션 라우팅**: 같은 room의 소켓 A/B가 서로 다른 Game 인스턴스에 연결됐을 때, `server.to(room).emit(...)` 같은 브로드캐스트가 실제로 상대 인스턴스의 소켓까지 전달되는가. 그리고 Engine.IO가 **HTTP long-polling**을 쓰면 같은 연결의 연속된 요청이 매번 다른 인스턴스로 라우팅될 수 있어, ALB에 session affinity(sticky session)가 없으면 연결 자체가 깨질 수 있다.

Redis 상태 공유만으로는 두 번째 문제(커넥션 라우팅)를 해결하지 못한다. Socket.IO Redis Adapter가 브로드캐스트 문제를 풀어주더라도, transport가 long-polling이면 sticky session이 별도로 필요하다.

## 결정

1. `apps/game`은 Socket.IO Redis Adapter(`RedisIoAdapter`, `apps/game/src/common/redis-io.adapter.ts`)를 `app.listen()` 이전에 연결한다(`main.ts`). `REDIS_HOST`가 설정된 환경(prod)에서 연결에 모두 실패하면 로컬 폴백으로 조용히 넘어가지 않고 부팅 자체를 실패시킨다 — split-brain(소켓 브로드캐스트만 인스턴스에 고립된 상태)으로 계속 떠 있는 것보다 안전하다는 판단이다.
2. `apps/web`의 Socket.IO 클라이언트(`apps/web/src/api/socket.ts:69-70`)는 `transports: ['websocket']`으로 고정한다 — HTTP long-polling으로 폴백하지 않는다.
3. 위 두 조건(Redis Adapter + WebSocket-only 클라이언트)을 근거로, ECS `game_ecs` ALB 타겟그룹(`infra/terraform/modules/load_balancer`)에는 **sticky session을 설정하지 않는다**. 리스너 규칙은 `game_traffic_target` 변수로 EC2/ECS 사이를 weighted forward로 전환할 뿐, 어느 쪽 타겟그룹에도 stickiness 블록을 두지 않는다.
4. multi-instance 환경(두 개 이상의 Game 인스턴스에 사용자가 실제로 분산된 상태)에서 cross-instance 브로드캐스트, room 상태 일관성, reconnect, 분산 락/fencing이 정상 동작하는지는 이 저장소 밖에서 사용자가 별도로 검증했다(2026-08-29) — WebSocket-only 환경에서 문제가 없었다는 결론이다. 검증 로그/리포트는 이 저장소에 남아 있지 않다.

## 근거

- **왜 WebSocket-only인가**: Engine.IO의 HTTP long-polling은 같은 논리적 연결의 요청이 여러 개의 개별 HTTP 요청으로 쪼개지므로, 로드밸런서가 매 요청을 다른 백엔드 인스턴스로 보내면 그 요청들이 같은 세션으로 합쳐지지 못해 연결이 깨진다. WebSocket은 최초 업그레이드 이후 단일 TCP 연결을 유지하므로, 그 연결이 어느 Task로 라우팅됐는지는 연결이 끊기기 전까지 바뀌지 않는다 — sticky session이 애초에 풀어야 할 문제 자체가 없다.
- **왜 서버가 아니라 클라이언트에서 제한하는가**: Socket.IO/Engine.IO의 transport 협상은 클라이언트가 시작한다. `apps/web`이 유일한 프로덕션 클라이언트이고 이미 `transports: ['websocket']`로 폴링을 요청하지 않으므로, 이번 결정은 기존 코드에 이미 있던 제약을 인프라 결정(sticky session 생략)의 근거로 명시한 것이지 새로 도입한 제약이 아니다.
- **Redis Adapter가 푸는 문제와 sticky session이 푸는 문제는 다르다**: Adapter는 "서로 다른 인스턴스에 붙은 소켓끼리 room 브로드캐스트를 받게" 한다. sticky session은 "같은 소켓의 연속된 요청이 같은 인스턴스로 가게" 한다. WebSocket-only에서는 후자가 애초에 발생하지 않는 상황(연결이 유지되는 동안 요청 자체가 없다)이라 sticky session이 불필요해지는 것이지, Redis Adapter가 그 필요성을 대신 없애주는 것이 아니다 — 이 둘을 같은 문제로 뭉뚱그리면 안 된다(`docs/infra/ecs-fargate-migration-plan.md`의 "Game multi-instance 관련 고려사항" 절도 이 구분을 명시하고 있다).

## 결과 및 트레이드오프

- **이 결정은 "WebSocket-only 클라이언트"라는 전제가 깨지면 함께 깨진다.** 서버 쪽(`room.gateway.ts`의 `@WebSocketGateway` 옵션)은 지금 `transports`를 명시적으로 제한하지 않아, Engine.IO 기본값대로 여전히 long-polling 요청을 받아들인다. 즉 이 불변식은 코드로 강제되지 않고 `apps/web` 클라이언트 설정 하나에 암묵적으로 의존한다. 새 클라이언트(관리자 도구, 다른 플랫폼 앱 등)를 추가하거나 `apps/web`의 transport 설정을 바꿀 때는 이 ADR을 함께 확인해야 한다. 서버 쪽에서 `transports: ['websocket']`을 명시적으로 강제하는 방안(Engine.IO 옵션)은 이번 결정에 포함하지 않았다 — 별도 검토 대상으로 남긴다.
- **검증이 저장소 밖에서 이루어졌다.** cross-instance broadcast, room 상태 일관성, reconnect, 분산 락/fencing에 대한 실제 부하 테스트 로그나 리포트가 이 저장소에 없다 — 재현 가능한 근거가 아니라 사용자 확인에 의존한 결정이다. 이후 실제 `game_traffic_target = "ecs"` 전환 및 안정화 기간 중 회귀가 발견되면 이 ADR을 재검토한다.
- ALB에 sticky session이 없으므로, Task가 scale-out/in되거나 배포로 교체될 때 특정 인스턴스에 편중된 연결 분포가 새 Task로 자동 재분배되지 않는다는 점은 여전히 남아 있는 별개의 이슈다(`docs/infra/ecs-fargate-migration-plan.md`의 Auto Scaling 고려사항 참고) — 이 ADR은 sticky session의 필요 여부만 다루고, connection 재분배 문제는 5단계(Auto Scaling)에서 별도로 다룬다.

## 고려했지만 선택하지 않은 대안

- **ALB duration-based sticky cookie를 켜둔 채로 시작**: WebSocket 연결에는 실질적 효과가 없고(연결이 유지되는 동안 재라우팅될 요청이 없음), 오히려 향후 관리자 도구 등에서 별도 세션 개념과 혼동될 여지가 있어 채택하지 않았다.
- **서버 쪽 `transports: ['websocket']` 강제**: 더 안전한 방향이지만, 지금 유일한 클라이언트가 이미 WebSocket-only이고 이번 4단계 범위(ECS 인프라 구성)를 벗어나는 애플리케이션 코드 변경이라 이번 결정에서는 제외했다. 새 클라이언트가 추가되기 전에 적용을 검토한다.
