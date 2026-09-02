# 범용 알림 시스템 기획

- 상태: Draft (검토 중)
- 관련 문서: [`docs/features/user-quiz-registration/spec.md`](../user-quiz-registration/spec.md)(첫 소비처), [`docs/adr/0004-game-service-split.md`](../../adr/0004-game-service-split.md)
- 배경: 원래 [로그인 유저 퀴즈 등록](../user-quiz-registration/spec.md) 기획의 "등록 실패 알림"으로 시작했으나, 논의 중 전체 공지 등 다른 용도로도 재사용할 범용 알림 인프라로 범위를 넓혔다. 이후 다른 기능에서 알림이 필요하면 새 테이블을 만들지 않고 이 시스템에 `NOTI_TYPE`을 추가하는 식으로 확장한다.
- **독립성**: 이 문서는 다른 기능에 의존하지 않는 선행 인프라다. 퀴즈 등록 기능은 이 시스템을 다 쓰는 소비자일 뿐이라, 알림의 스키마·API·UI는 전부 여기서 완결하고 퀴즈 등록 쪽 작업 없이도 끝까지(스키마 → API → UI) 만들고 검증할 수 있다. 퀴즈 등록 기능은 이 문서가 완료된 뒤 착수한다.

## 1. 데이터 모델

### `SQ_NOTI` (알림 마스터)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `NOTI_ID` | bigint unsigned, PK | |
| `NOTI_TYPE` | varchar | 알림 종류 discriminator (예: `QUIZ_REG_COMPLETED`, `ANNOUNCEMENT`) |
| `USER_KEY` | bigint unsigned, **nullable** | 대상 유저. **`NULL`이면 전체 유저 대상 공지.** (`-1` 등 매직 넘버를 쓰지 않는 이유: `User.userKey`가 unsigned라 음수 자체를 저장할 수 없다) |
| `TITLE` | varchar | |
| `MESSAGE` | varchar/text | 발송 시점에 완성해서 저장하는 문장 (템플릿이 아니라 최종 텍스트) |
| `PARAMS` | json, nullable | 메시지를 구성한 동적 값(예: `{"quizTtl": "아이유 노래 맞추기", "excludedSongs": [{"songNm": "봄날", "reasonCode": "LINK_FORMAT_INVALID"}]}`). 지금 당장 다국어를 지원하진 않지만, 나중에 다국어가 필요해졌을 때 과거 알림도 소급 대응할 수 있도록 미리 구조화해서 함께 저장해둔다(2번 참고). |
| `LINK_PATH` | varchar, nullable | 클릭 시 이동할 프런트 라우트 (예: `/quizzes/123/edit`) |
| `CRT_DT` | datetime | |

### `SQ_NOTI_READ` (유저별 읽음 여부)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `NOTI_READ_ID` | bigint unsigned, PK | |
| `NOTI_ID` | bigint unsigned | |
| `USER_KEY` | bigint unsigned | 읽은 유저 |
| `READ_DT` | datetime | |

`(NOTI_ID, USER_KEY)` unique. 이 조합의 행이 없으면 "안 읽음"이다.

개인 알림이든 전체 공지든 같은 메커니즘 하나로 처리한다 — 알림 자체에 읽음 플래그를 두면 전체 공지처럼 여러 유저가 보는 알림은 유저마다 읽은 시점이 달라 표현할 수 없기 때문에, "누가 읽었는지"를 별도 테이블로 분리했다.

**안 읽은 개수 계산**: `SQ_NOTI`에서 `USER_KEY = :me OR USER_KEY IS NULL`인 행 중 `SQ_NOTI_READ`에 `(NOTI_ID, :me)` 조합이 없는 행의 개수.

## 2. 다국어(i18n) 확장 대비

지금은 다국어를 만들지 않는다. 다만 나중에 필요해질 경우를 대비해 아래 원칙만 지금 반영한다.

- **개인화 알림**(동적 값이 들어간 시스템 알림, 예: 퀴즈 등록 완료): `MESSAGE`(완성 문장)와 함께 `PARAMS`(동적 값 구조화)를 항상 같이 저장한다. 완성 문장만 저장하면 나중에 "고정 문구"와 "동적 값"을 문자열에서 다시 분리할 방법이 없어 소급 번역이 불가능하다 — `PARAMS`를 남겨두면 나중에 `NOTI_TYPE`별 다국어 템플릿을 만들 때 과거 데이터도 재조립할 수 있다.
- **전체 공지**: 공지는 운영자가 사람이 직접 문구를 입력하는 것이라, 다국어가 필요해지면 `SQ_NOTI_I18N`(`NOTI_ID`, `LOCALE`, `TITLE`, `MESSAGE`) 테이블을 추가해 로케일별로 입력받고, 조회 시 유저 로케일로 찾고 없으면 기본 로케일(한국어)로 폴백하면 된다. 기존 데이터를 깨지 않는 추가 작업이라 지금 미리 만들 필요는 없다(YAGNI) — 다국어가 실제 요구사항이 될 때 만든다.

## 3. API 개요

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/notifications` | 내 알림 목록 + 안 읽은 개수 — `UserAuthGuard` |
| PATCH | `/notifications/read` | 조회된 알림들을 읽음 처리(벌크) — `UserAuthGuard` |
| GET | `/notifications/:notiId` | 알림 상세 조회 — `UserAuthGuard` |

발송 자체는 REST API가 아니라 서버 내부에서 다른 도메인 서비스가 알림 생성 함수를 호출하는 방식으로 이루어진다(예: 퀴즈 등록 완료 처리 로직이 `NotificationService.create({ notiType: 'QUIZ_REG_COMPLETED', userKey, ... })`를 호출).

## 4. UI/UX 설계 (`apps/web`)

기존 화면 스타일([`RoomListPage`](../../../apps/web/src/pages/RoomListPage.tsx))의 톤(퍼플 포인트 컬러, 흰 카드+shadow, 모달 기반 보조 UI)을 따른다.

- `RoomListPage` 헤더에 로그인 유저에게만 벨 아이콘을 노출한다. 배지 숫자는 `GET /notifications`가 반환하는 안 읽은 개수.
- 클릭 시 페이지 이동 없이 아이콘 아래 패널(흰 카드+shadow, `absolute` 위치)로 최근 알림 목록을 보여준다.
- 목록 항목 클릭 시 `/notifications/:notiId` 상세 페이지로 이동한다. 상세 페이지에는 `TITLE`/`MESSAGE` 전문, 발생 시각, `LINK_PATH`가 있으면 그 경로로 이동하는 버튼을 둔다.
- 이 벨/드롭다운/상세 페이지는 알림을 쓰는 모든 기능이 공유하는 화면이다 — [퀴즈 등록 기능의 마이페이지](../user-quiz-registration/spec.md)의 "알림" 탭도 같은 컴포넌트를 배치만 해서 재사용한다(새로 만들지 않는다).

## 5. 이번 단계 범위

- **포함**: `SQ_NOTI`/`SQ_NOTI_READ` 스키마, 조회/읽음 처리 API, 알림 벨/드롭다운/상세 페이지 UI. 이 넷은 퀴즈 등록 기능 없이도 독립적으로 완결·검증 가능하다(예: 임의의 테스트 알림으로 UI를 확인).
- **제외**: 운영자가 전체 공지를 작성하는 화면/API(스키마상 `USER_KEY NULL`로 전체 공지를 표현할 수 있게만 열어두고, 실제로 공지를 만드는 기능은 아직 없음), 다국어(`SQ_NOTI_I18N`), 실시간 소켓 전달(`apps/api`는 stateless REST 서비스로 유지 — [`ADR-0004`](../../adr/0004-game-service-split.md) 근거).
- **여기서 만들지 않는 것**: 실제로 `NotificationService.create(...)`를 호출해서 `QUIZ_REG_COMPLETED` 알림을 발송하는 코드. 그건 퀴즈 등록 기능의 최종 등록 API(비동기 안전망 재검증이 끝난 시점)에 들어가는 몇 줄이라, [퀴즈 등록 기획 7장](../user-quiz-registration/spec.md) 쪽 작업 항목으로 트래킹한다(이 시스템이 먼저 완성되어 있어야 그 호출이 가능하다).

## 6. 작업 단계

1. 스키마: `SQ_NOTI`, `SQ_NOTI_READ` 마이그레이션.
2. `NotificationService`(생성 함수) + 조회/읽음 처리 API.
3. (`apps/web`) 알림 벨 아이콘 + 드롭다운 + 상세 페이지 (4장).

이 3단계가 끝나야 [퀴즈 등록 기능](../user-quiz-registration/spec.md)을 시작한다.
