# ADR-0008: 문의 조치 재승인 시 중복 실행 허용(ADD_ANSWER만 예외) + 원자적 상태 검증

- 상태: Accepted
- 관련 코드: [`apps/api/src/inquiry/inquiry.service.ts`](../../apps/api/src/inquiry/inquiry.service.ts)(`approve`/`reject`/`transitionAction`)

## 배경

관리자(또는 향후 Slack 인터랙션)가 `InquiryAction`을 승인(`approve`)하면 판별된 조치(`CHANGE_START_TIME`/`CHANGE_LINK`/`ADD_ANSWER`)를 실제로 실행한다. 이때 "현재 액션이 이미 승인/실행된 상태여도 다시 승인할 수 있어야 하는가"라는 질문이 있었다 - 예를 들어 관리자가 이미 반영된 시작 시간 변경을 다시 한번 승인 버튼으로 재적용하고 싶을 수 있다.

코드 리뷰에서 "문의 조치 승인에 원자적 상태 검증이 없어 중복 실행/반려 우회가 가능함(P1)"이라는 지적이 나왔다. 두 가지 다른 문제가 섞여 있었다.

1. **재승인(중복 실행) 자체가 의도인가, 버그인가**: `ADD_ANSWER`를 뺀 나머지는 의도된 동작이다.
2. **의도된 예외(`ADD_ANSWER` 완료 시 재승인 차단)를 어떻게 안전하게 구현하는가**: 기존 구현은 "현재 상태를 조회해서 코드에서 확인한 뒤 UPDATE"하는 방식이라, 동시에 두 번 승인 요청이 들어오면 둘 다 확인을 통과해버려 정답이 중복으로 추가될 수 있었다(TOCTOU race). `reject`도 마찬가지로 "PENDING_REVIEW인지 확인 후 REJECTED로 변경"하는 방식이라, 승인이 먼저 실행된 직후에 반려가 뒤늦게 성공해 "이미 실행된 조치가 REJECTED로 표시되는" 상태 불일치(반려 우회)가 가능했다.

## 결정

**1) 재승인 허용 여부는 조치 타입별로 다르게 간다.**

- `CHANGE_START_TIME`/`CHANGE_LINK`: 현재 `InquiryAction.status`와 무관하게 몇 번이든 재승인할 수 있다. 결과가 `args`로부터 결정적으로 계산되고 같은 필드를 덮어쓰므로(`QuizSong.startSec`/`youtubeUrl` 등), 두 번 실행해도 최종 상태는 같다(멱등적) - 관리자가 이미 완료/반려된 항목도 다시 밀어넣을 수 있는 게 오히려 유용하다.
- `ADD_ANSWER`: 실행할 때마다 `SQ_QUIZ_SONG_ANSWER`에 새 행을 INSERT하므로 멱등적이지 않다. 이미 `COMPLETED`(또는 승인/실행이 진행 중인) 액션은 재승인을 막는다.

**2) `ADD_ANSWER`의 재승인 차단과 `reject`의 "검토 대기 상태만 반려 가능" 규칙은 애플리케이션 코드의 확인-후-변경이 아니라, DB `UPDATE` 문의 `WHERE` 조건으로 원자적으로 처리한다(compare-and-swap).**

```sql
-- approve(ADD_ANSWER)
UPDATE SQ_INQUIRY_ACTION SET STATUS='APPROVED', ...
WHERE ACTION_ID = ? AND STATUS NOT IN ('APPROVED','EXECUTING','COMPLETED');

-- reject
UPDATE SQ_INQUIRY_ACTION SET STATUS='REJECTED', ...
WHERE ACTION_ID = ? AND STATUS IN ('PENDING_REVIEW');
```

`UPDATE`가 0행에 반영되면(`affected === 0`) 그 사이 다른 요청이 먼저 상태를 바꿔버렸다는 뜻이므로 400 에러로 응답한다. `CHANGE_START_TIME`/`CHANGE_LINK`의 `approve`는 이 가드를 걸지 않는다(위 1번 결정대로 항상 성공해야 하므로).

## 근거

- MySQL은 `UPDATE` 실행 중 대상 행에 락을 건다. 동시에 들어온 두 번째 요청의 `UPDATE`는 첫 번째 트랜잭션이 끝날 때까지 대기했다가, 바뀐 상태를 기준으로 `WHERE` 조건을 다시 평가받는다 - 별도의 분산 락이나 `SELECT ... FOR UPDATE` 없이 단일 조건부 `UPDATE`만으로 경쟁 상태를 막을 수 있다.
- 애플리케이션 레벨의 "조회 후 확인"은 조회 시점과 실제 반영 시점 사이에 창(window)이 생겨 동시 요청을 근본적으로 막지 못한다. 이번 리뷰 지적이 바로 그 창을 파고든 시나리오다.
- 모든 액션 타입에 획일적으로 "이전 상태가 X여야만 승인 가능"을 강제하지 않고 타입별로 가드 유무를 다르게 둔 이유: `CHANGE_START_TIME`/`CHANGE_LINK`까지 엄격하게 막으면 관리자의 재적용 워크플로우가 막힌다. 안전(원자성)과 유연성(재실행 허용) 둘 다, 실제로 위험한 경우(비멱등 INSERT)에만 좁혀서 얻을 수 있었다.

## 결과 및 트레이드오프

- `CHANGE_START_TIME`/`CHANGE_LINK`를 짧은 시간에 동시에 두 번 승인하면 `QuizSong` UPDATE가 중복으로 실행된다(멱등적이라 최종 상태는 같지만, `SQ_INQUIRY_ACTION_LOG`에 `APPROVED`/`EXECUTING`/`COMPLETED` 로그가 중복으로 쌓일 수 있다) - 감사 로그의 완전한 유일성보다 재실행 유연성을 우선한 트레이드오프다.
- 새 조치 타입을 추가할 때는 그 타입의 실행이 멱등적인지(재실행돼도 안전한지) 먼저 판단해야 한다. 비멱등이면 `ADD_ANSWER`와 동일하게 `approve`에 `guardStatusNotIn`을 추가해야 한다 - 자동으로 감지되지 않으므로 리뷰 시 체크리스트로 남긴다.
- Slack 인터랙션 엔드포인트(아직 미구현, [`ADR-0007`](0007-shared-package-for-cross-app-code.md)와 무관한 후속 작업)가 붙어도 `approve`/`reject`가 이미 원자적이라 별도 동시성 처리가 필요 없다.
