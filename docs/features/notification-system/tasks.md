# 작업 진행 현황

[`spec.md`](spec.md) 6장 "작업 단계" 기준. 이 3개는 퀴즈 등록 기능과 무관하게 독립적으로 완료할 수 있고, **퀴즈 등록 기능 착수 전에 끝내는 게 목표다.**

- 상태 값: 미착수 / 진행중 / 리뷰중 / 완료 / 보류
- 이슈 상태(Open/Closed)와 이 표의 상태가 다르면 이 표를 갱신한다(이슈가 Closed면 완료로 맞춘다).

| # | 단계 | 이슈 | 상태 | 비고 |
|---|---|---|---|---|
| 1 | 스키마: SQ_NOTI + SQ_NOTI_READ | [#151](https://github.com/erjin-lee/song-quiz/issues/151) | 미착수 | 다른 단계의 선행 조건 |
| 2 | 알림 생성 함수 + 조회/읽음 처리 API | [#152](https://github.com/erjin-lee/song-quiz/issues/152) | 미착수 | #151 선행 필요 |
| 3 | (apps/web) 알림 벨 + 드롭다운 + 상세 페이지 | [#154](https://github.com/erjin-lee/song-quiz/issues/154) | 미착수 | #152 선행 필요 |

이 3개가 모두 완료되면 [퀴즈 등록 기능](../user-quiz-registration/tasks.md)을 시작한다(그 기능의 최종 등록 API가 `NotificationService.create(...)`를 호출한다).

전체 이슈: [milestone "범용 알림 시스템"](https://github.com/erjin-lee/song-quiz/milestone/2)

## 폐기된 이슈

| 이슈 | 폐기 사유 |
|---|---|
| [#153](https://github.com/erjin-lee/song-quiz/issues/153) (퀴즈 등록 실패 알림 발송 연동) | 실제로는 [퀴즈 등록 기능 #145](https://github.com/erjin-lee/song-quiz/issues/145) 구현의 일부(호출 몇 줄)라 그쪽으로 합침 |

## 갱신 이력

- 2026-09-02: [퀴즈 등록 기능](../user-quiz-registration/spec.md) 논의 중 알림을 범용 시스템으로 분리하며 문서/이슈 신규 생성.
- 2026-09-02: 퀴즈 등록 기능과 완전히 분리 — 실제 발송 호출(#153)을 퀴즈 등록 쪽 이슈(#145)로 합치고, 이 문서의 3단계는 퀴즈 등록 기능과 무관하게 먼저 끝내는 선행 작업으로 명시.
