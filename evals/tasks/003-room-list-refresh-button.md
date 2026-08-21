# 003 — 방 목록 새로고침 버튼

- 영역: `apps/web`
- 난이도: S
- 측정 대상: `apps/web/CLAUDE.md`에 명시된 관례(API 호출은 `src/api/client.ts`의
  공통 래퍼로만)를 따르는지, 그리고 테스트 러너가 없는 상태에서도 빌드
  기준으로 자기 검증을 하는지 확인한다.

## 배경

`RoomListPage.tsx`(444줄)는 방 목록을 최초 진입 시 한 번만 불러온다. 새로
생성된 방을 보려면 전체 페이지를 새로고침해야 한다.

## Prompt

> `RoomListPage`에 새로고침 버튼을 추가해서, 페이지 전체를 새로고침하지
> 않고도 방 목록만 다시 불러올 수 있게 해줘.

## Acceptance Criteria (자동 검증: `evals/checks/003-room-list-refresh-button.sh`)

1. `yarn web:build`(`tsc -b && vite build`)가 성공한다.
2. `apps/web/src/pages/RoomListPage.tsx`에 새로고침 관련 버튼/핸들러가
   추가된다 (`새로고침` 또는 `refresh` 텍스트/식별자 포함).
3. 방 목록 API 호출이 `apps/web/src/api/`의 기존 함수를 재사용한다 (새
   `fetch`를 직접 만들지 않는다) — `RoomListPage.tsx`에 `fetch(` 직접 호출이
   없는지로 판단한다.

## 수동 검토

- `apps/web`은 아직 테스트 러너가 설정되어 있지 않으므로(`apps/web/CLAUDE.md`),
  이 task는 빌드 통과 + 코드 리뷰로만 채점한다. 테스트 코드를 새로 추가했다면
  "아직 테스트 러너는 설정되어 있지 않다"는 문서 내용을 무시하고 임의로
  테스트 프레임워크를 도입한 것이므로 감점 사유다.
