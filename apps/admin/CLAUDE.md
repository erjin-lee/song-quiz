# Admin conventions (apps/admin)

- Next.js 14(App Router) + TypeScript 기반 SPA다. `apps/web`과 별개의 워크스페이스이며, Node/Next 버전을 독립적으로 관리한다.
- 개발 서버 포트는 Next.js 기본값(`3000`)을 사용한다. `apps/web`(5173), `apps/api`(8001)와 겹치지 않는다.
- UI는 shadcn/ui 패턴(Tailwind CSS v3 + CVA + Radix UI)을 따른다. 컴포넌트는 `src/components/ui/`에 두고, 필요한 프리미티브가 없으면 기존 컴포넌트와 같은 스타일로 직접 추가한다.
- 인증은 `apps/api`의 `POST /admin/auth/login`(DB의 `SQ_USER`, ROLE=ADMIN 계정 기준)에서 발급하는 JWT를 사용한다. 로그인 성공 시 `accessToken`을 `sessionStorage`(`admin_token`)에 저장하고, 이후 모든 API 호출에 `Authorization: Bearer <token>`으로 첨부한다(`src/lib/api-client.ts`).
- 인증이 필요한 라우트는 `src/app/(protected)/` 라우트 그룹 아래에 둔다. `RequireAuth` 컴포넌트(`src/components/require-auth.tsx`)가 미인증 시 `/login`으로 리다이렉트한다.
- 백엔드 REST 호출은 `src/lib/api-client.ts`의 `apiGet` 래퍼를 통해서만 한다. API base URL은 `NEXT_PUBLIC_API_BASE_URL` env, 없으면 `http://localhost:8001`.
- API 응답 타입은 `apps/api`의 DTO 형식과 어긋나지 않게 `src/types/`에 그대로 미러링한다.
- 인증이 필요한 데이터 조회 화면은 `sessionStorage` 기반 인증 상태에 의존하므로 Client Component(`'use client'`)로 작성한다.

# Project layout

- `src/app/`: App Router 라우트. `(protected)/`는 로그인 필요, `login/`은 공개.
- `src/components/ui/`: shadcn/ui 컴포넌트.
- `src/components/providers/auth-provider.tsx`: 인증 상태 Context(`useAuth`).
- `src/lib/`: API 클라이언트, 인증 유틸.
- `src/types/`: `apps/api`의 DTO를 미러링한 타입.
- 아직 테스트 러너는 설정되어 있지 않다.

# Commands

- Admin 빌드: `yarn admin:build` (루트에서 turbo 필터 실행)
- Admin 개발 서버: `yarn admin`
- 워크스페이스 내부에서 직접 실행: `yarn workspace admin dev`, `yarn workspace admin build`, `yarn workspace admin lint`

# Verification

1. 변경된 파일의 타입 오류를 확인한다 (`yarn workspace admin build`는 타입 체크를 포함한다).
2. 영향 범위가 넓으면 Admin 빌드를 실행한다 (`yarn admin:build`).
