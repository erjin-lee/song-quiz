# 작업 진행 현황

[`spec.md`](spec.md) 6장 "작업 단계" 기준. 이 3개는 퀴즈 등록 기능과 무관하게 독립적으로 완료할 수 있고, **퀴즈 등록 기능 착수 전에 끝내는 게 목표다.**

- 상태 값: 미착수 / 진행중 / 리뷰중 / 완료 / 보류
- 이슈 상태(Open/Closed)와 이 표의 상태가 다르면 이 표를 갱신한다(이슈가 Closed면 완료로 맞춘다).

| # | 단계 | 이슈 | 상태 | 비고 |
|---|---|---|---|---|
| 1 | 스키마: SQ_NOTI + SQ_NOTI_READ | [#151](https://github.com/erjin-lee/song-quiz/issues/151) | 완료(`migration:run`은 사람이 해야 함) | 아래 "구현 메모" 참고 |
| 2 | 알림 생성 함수 + 조회/읽음 처리 API | [#152](https://github.com/erjin-lee/song-quiz/issues/152) | 완료 | |
| 3 | (apps/web) 알림 벨 + 드롭다운 + 상세 페이지 | [#154](https://github.com/erjin-lee/song-quiz/issues/154) | 완료 | |

이 3개가 모두 완료되면 [퀴즈 등록 기능](../user-quiz-registration/tasks.md)을 시작한다(그 기능의 최종 등록 API가 `NotificationService.create(...)`를 호출한다).

전체 이슈: [milestone "범용 알림 시스템"](https://github.com/erjin-lee/song-quiz/milestone/2)

## 구현 메모

- **마이그레이션**: 처음엔 bastion 터널 접근이 안 되는 작업 환경이라 손으로 DDL을 작성했었는데(`1788195000000-CreateNotificationTables.ts`), 이후 실제 DB에 붙어 정식 `migration:generate`로 [`1788328901865-notification.ts`](../../../apps/api/src/migrations/1788328901865-notification.ts)가 새로 생성되어 이걸 정본으로 쓴다(손으로 쓴 파일은 중복이라 삭제). 컬럼/타입/코멘트가 엔티티와 정확히 일치함을 확인했다. **`migration:run`은 여전히 사람이 직접 실행해야 한다**(기존 절차와 동일). 전체 마이그레이션 이력은 [`docs/db-changelog.md`](../../db-changelog.md) 참고.
- 새 모듈: `apps/api/src/notification/`(entities/notification.entity.ts, entities/notification-read.entity.ts, notification.service.ts, notification.controller.ts, notification.module.ts, notification.constants.ts, dto/). `app.module.ts`에 등록했다.
- `UserModule`이 `UserAuthGuard`를 새로 export하도록 한 줄 추가했다(다른 모듈에서 재사용하기 위해 — 기존에는 export되지 않아 `UserModule` 밖에서 쓸 수 없었다).
- 알림 대상 유저 식별: JWT 페이로드에는 `userId`(외부 식별자)만 있고 `USER_KEY`(내부 FK)가 없어서, `UserService.findUserKeyByUserId()`(기존 공개 메서드)로 매번 변환한다.
- 프런트엔드: `apps/web/src/components/NotificationBell.tsx`(30초 폴링 + 드롭다운, 열면 전체 읽음 처리), `apps/web/src/pages/NotificationDetailPage.tsx`(`/notifications/:notiId`, 조회 즉시 읽음 처리), `RoomListPage` 헤더에 로그인 유저 전용으로 배치.
- 검증: `apps/api` 유닛 테스트 9건 추가(`notification.service.spec.ts`) + 전체 테스트(262건)/빌드 통과. `apps/web` 유닛 테스트 9건 추가(`NotificationBell.test.tsx` 5건, `NotificationDetailPage.test.tsx` 4건) + 전체 테스트(92건)/빌드/린트 통과.
- 아직 없는 것(다음 단계 몫): 실제로 `NotificationService.create(...)`를 호출해서 `QUIZ_REG_COMPLETED` 알림을 보내는 코드([퀴즈 등록 기능 #145](https://github.com/erjin-lee/song-quiz/issues/145)에서 구현), 운영자 전체 공지 작성 화면, 다국어.

## 폐기된 이슈

| 이슈 | 폐기 사유 |
|---|---|
| [#153](https://github.com/erjin-lee/song-quiz/issues/153) (퀴즈 등록 실패 알림 발송 연동) | 실제로는 [퀴즈 등록 기능 #145](https://github.com/erjin-lee/song-quiz/issues/145) 구현의 일부(호출 몇 줄)라 그쪽으로 합침 |

## 갱신 이력

- 2026-09-02: [퀴즈 등록 기능](../user-quiz-registration/spec.md) 논의 중 알림을 범용 시스템으로 분리하며 문서/이슈 신규 생성.
- 2026-09-02: 퀴즈 등록 기능과 완전히 분리 — 실제 발송 호출(#153)을 퀴즈 등록 쪽 이슈(#145)로 합치고, 이 문서의 3단계는 퀴즈 등록 기능과 무관하게 먼저 끝내는 선행 작업으로 명시.
- 2026-09-02: #151, #152, #154 구현 완료(스키마 손 작성, API, apps/web UI). 테스트/빌드/린트 통과 확인.
- 2026-09-02: 실제 DB로 정식 `migration:generate` 실행 → `1788328901865-notification.ts`로 교체, 손으로 쓴 파일 삭제. [`docs/db-changelog.md`](../../db-changelog.md) 신설.
