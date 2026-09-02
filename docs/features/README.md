# Feature 기획 문서

새 기능을 만들기 전 기획/설계 내용을 정리하는 공간이다. "왜 이렇게 결정했는지"의 배경이 아니라(그건 [`docs/adr/`](../adr/README.md)), "무엇을 어떻게 만들 것인지"를 다룬다.

## 구조

기능마다 `docs/features/<기능-이름>/` 디렉토리를 만들고 그 아래 둘을 둔다.

- `spec.md`: 기획/설계 문서(배경, 플로우, 상세 설계, 데이터 모델, API 개요, 작업 단계)
- `tasks.md`: 작업 단계별 진행 현황(단계 ↔ GitHub 이슈 ↔ 상태)

설계가 바뀌면 `spec.md`를 갱신하고, 진행 상황이 바뀌면 `tasks.md`를 갱신한다 — 둘을 분리해두는 이유는 진행 상황이 설계보다 훨씬 자주 바뀌기 때문이다.

## 목록

| 기능 | 상태 | 문서 |
|---|---|---|
| 로그인 유저 퀴즈 등록 | Draft (구현 대기) | [spec](user-quiz-registration/spec.md) · [tasks](user-quiz-registration/tasks.md) |
| 범용 알림 시스템 | 구현 완료(마이그레이션 실행은 사람이 해야 함) | [spec](notification-system/spec.md) · [tasks](notification-system/tasks.md) |
