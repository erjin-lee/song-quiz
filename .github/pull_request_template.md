## 변경 요약

<!-- 무엇을, 왜 변경했는지 1-3줄로 -->

## 변경 범위

- [ ] 관련 앱: `apps/api` / `apps/web` / `apps/admin` / `packages/*` / 루트
- [ ] 브랜치명이 [`CONTRIBUTING.md`](../CONTRIBUTING.md) 규칙(`feat/`, `fix/`, `refactor/`, `docs/`, `test/`, `chore/`)을 따른다.
- [ ] 커밋 메시지가 Conventional Commits 형식(한국어 description)을 따른다.

## 셀프 리뷰 체크리스트

- [ ] `git diff`로 변경 내용을 다시 확인했다.
- [ ] 외부/신뢰할 수 없는 입력(사용자 제출 값, 스크래핑 결과, LLM 응답 등)을 다루는 변경이라면 경계값·잘못된 입력 처리를 다시 살펴봤다(테스트 통과가 곧 버그 없음을 보장하지 않는다).
- [ ] 변경된 파일의 타입 오류를 확인했다.
- [ ] 관련 테스트와 lint를 실행했다.
- [ ] 영향 범위가 넓으면 관련 앱을 빌드했다 (`yarn api:build` / `yarn web:build` / `yarn admin:build`).
- [ ] `apps/api`의 DTO를 변경했다면 `apps/web`, `apps/admin`의 `src/types/`도 함께 갱신했다.
- [ ] 설계 배경이 바뀌었다면 관련 ADR([`docs/adr/`](../docs/adr/README.md))이나 [`ARCHITECTURE.md`](../ARCHITECTURE.md)를 함께 갱신했다.

## 테스트 방법

<!-- 리뷰어가 재현할 수 있도록 실행한 명령/시나리오를 적는다 -->
