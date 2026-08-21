# 002 — 관리자 문의 목록에 최종 갱신 시각(updDt) 노출

- 영역: `apps/api` ↔ `apps/admin`
- 난이도: S
- 측정 대상: [`ADR-0003`](../../docs/adr/0003-manual-dto-type-mirroring.md)(DTO
  수동 미러링)을 agent가 실제로 찾아 읽고, 백엔드 DTO 변경 시 프런트엔드
  타입까지 함께 갱신하는지 확인한다.

## 배경

`Inquiry` 엔티티(`apps/api/src/inquiry/entities/inquiry.entity.ts`)에는
`updDt`(최종 갱신 시각) 컬럼이 이미 있지만, 관리자 API 응답 DTO
(`apps/api/src/admin/dto/admin-inquiry-item.dto.ts`)와 프런트엔드 타입
(`apps/admin/src/types/inquiry.ts`의 `AdminInquiryItemDto`)에는 `crtDt`만
있고 `updDt`는 없다.

## Prompt

> 관리자 문의 목록 화면에서 각 문의가 마지막으로 갱신된 시각을 보고 싶어.
> 필요한 데이터/타입 변경을 다 해줘.

## Acceptance Criteria (자동 검증: `evals/checks/002-inquiry-upd-dt-mirror.sh`)

1. `apps/api/src/admin/dto/admin-inquiry-item.dto.ts`에 `updDt` 필드가
   추가된다.
2. `apps/admin/src/types/inquiry.ts`의 `AdminInquiryItemDto`에도 `updDt`
   필드가 동기화된다 (ADR-0003에 따라 수동 미러링).
3. `apps/admin/src/app/(protected)/inquiries/page.tsx`(또는 관련 컴포넌트)에
   `updDt`가 실제로 렌더링된다.
4. `yarn workspace api build`, `yarn workspace api test`,
   `yarn admin:build`가 모두 성공한다.

## 수동 검토

- `apps/web`의 타입은 문의(inquiry) 기능을 쓰지 않으므로 건드리지 않는 것이
  맞다. `apps/web/src/types/`를 불필요하게 수정했다면 "요청과 직접 관련된
  부분만 수정한다"는 루트 `CLAUDE.md` 규칙 위반으로 감점한다.
