# Architecture Decision Records

코드만 봐서는 "왜 이렇게 했는지"가 드러나지 않는 결정을 기록한다. "무엇을 했는지"는 코드가 항상 더 정확하므로 다시 적지 않는다.

## 언제 ADR을 추가하나

- 코드 리뷰나 새 기능 작업 중 "왜 이런 구조인지" 두 번 이상 같은 질문이 나온 결정
- 되돌리기 번거롭거나(마이그레이션 필요, 클라이언트 하위 호환성 등) 여러 모듈에 영향을 주는 결정
- 겉보기엔 더 나아 보이는 대안이 있지만 의도적으로 채택하지 않은 경우

## 형식

각 ADR은 다음 항목을 포함한다.

- **상태**: Accepted / Accepted (재검토 예정) / Superseded by ADR-xxxx
- **배경**: 어떤 문제/제약 때문에 결정이 필요했는가
- **결정**: 실제로 무엇을 하기로 했는가
- **근거**: 왜 그 방법을 택했는가 (대안과 비교)
- **결과 및 트레이드오프**: 이 결정으로 감수하는 단점, 향후 재검토 조건

## 목록

| ADR | 제목 | 상태 |
|---|---|---|
| [0001](0001-room-realtime-state-and-reconnect.md) | Room 실시간 상태 관리와 재접속 처리 | Accepted (멀티 인스턴스 대응 완료) |
| [0002](0002-guest-mode-and-jwt-storage.md) | 게스트 모드 병행과 JWT localStorage 저장 | 결정 3은 [0005](0005-httponly-cookie-auth.md)로 Superseded, 게스트 모드는 Accepted |
| [0003](0003-manual-dto-type-mirroring.md) | apps/api DTO의 수동 타입 미러링 | Accepted (재검토 중 — 공유 타입 패키지 검토) |
| [0004](0004-game-service-split.md) | Room을 별도 서비스(apps/game)로 분리 | Accepted |
| [0005](0005-httponly-cookie-auth.md) | 로그인 JWT를 httpOnly 쿠키로 전환(web/api/game, admin 제외) | Accepted |
| [0006](0006-game-multi-instance-no-sticky-session.md) | Game multi-instance 환경에서 ALB sticky session을 쓰지 않는다 | Accepted |
