# Root scripts (scripts/)

# Purpose

레포 전체에 걸친 유지보수 스크립트를 소유한다. 특정 앱에 속하지 않는 것만 여기 둔다.

- `validate-context-paths.mjs`: CLAUDE.md들이 참조하는 상대경로 markdown 링크가 실제로 존재하는지 검증한다. 대상은 스크립트 안에 하드코딩된 `contextFiles` 배열(`CLAUDE.md`, `apps/api/CLAUDE.md`, `apps/web/CLAUDE.md`, `apps/admin/CLAUDE.md`)뿐이다 — `apps/game/CLAUDE.md`, `evals/CLAUDE.md`, `packages/*/CLAUDE.md`, `apps/lambda/CLAUDE.md`, 이 파일은 검증 대상에 포함되지 않는다. 새 검증 대상을 추가하려면 이 배열에 경로를 더한다.
- `scripts/sh/`는 `.gitignore` 대상(로컬 전용 스크래치)이라 이 저장소에 커밋되지 않는다 — 다른 개발자나 CI에는 존재하지 않으므로 여기서 문서화하지 않는다.

# Dependencies

- `.github/workflows/validate-context.yml`이 `CLAUDE.md` / `apps/**/CLAUDE.md` / `.claude/**` / 이 스크립트 자신이 변경된 PR·push에서 `node scripts/validate-context-paths.mjs`를 실행한다.

# Commands

```bash
node scripts/validate-context-paths.mjs
```

# Verification

- 새 CLAUDE.md의 markdown 링크가 깨지지 않았는지 확인하려면 위 명령을 직접 실행한다(단, `contextFiles` 배열에 없는 파일은 이 명령으로 검증되지 않는다).
