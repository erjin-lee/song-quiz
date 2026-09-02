# Contributing

## Branches

`main`, `master`, `develop` 브랜치에서 직접 코드를 수정하지 않는다.

작업별 브랜치를 생성한다.

- 기능: `feat/`
- 버그: `fix/`
- 리팩터링: `refactor/`
- 문서: `docs/`
- 테스트: `test/`
- 유지보수: `chore/`

브랜치 이름은 lowercase kebab-case를 사용한다.

## Commits

Git commit과 push는 사용자가 명시적으로 요청한 경우에만 실행한다.

커밋할 때는 Conventional Commits 형식을 사용한다.

```text
<type>(<optional-scope>): <description>
```

허용 type:

```text
feat, fix, refactor, perf, test, docs, build, ci, chore
```

- commit message는 한국어로 작성한다.
- Claude, AI 등 작업 도구를 commit message에 언급하지 않는다.
- 현재 작업과 관련된 변경만 stage한다.

## Verification

commit 전에:

1. `git diff`로 변경 내용을 확인한다.
2. 외부/신뢰할 수 없는 입력(사용자 제출 값, 스크래핑 결과, LLM 응답 등)을 다루는
   변경이라면 경계값·잘못된 입력이 어떻게 처리되는지 스스로 다시 살펴본다 -
   작성자 본인이 놓친 케이스는 같은 사람이 쓴 테스트에도 똑같이 반영되지 않으므로,
   테스트 통과가 곧 버그 없음을 보장하지 않는다. 보안이나 자동 승인/실행에 영향을
   주는 비-trivial 변경은 PR을 올리기 전에 리뷰 도구를 먼저 실행해 본다.
3. 변경된 파일의 타입 오류를 확인한다.
4. 관련 테스트와 lint를 실행한다.
5. 영향 범위가 넓으면 관련 앱을 빌드한다.
6. 검증이 실패하면 commit하지 않는다.

앱별 검증 명령은 각 앱의 `CLAUDE.md`를 따른다.

## Push

사용자가 push를 요청했고 commit 및 검증이 성공한 경우:

```bash
git push -u origin HEAD
```

force push는 하지 않는다.
