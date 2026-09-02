# 작업 진행 현황

[`spec.md`](spec.md) 7장 "작업 단계" 기준. 상태는 이 표를 기준으로 관리하고, 실제 작업/리뷰는 각 GitHub 이슈에서 진행한다.

- 상태 값: 미착수 / 진행중 / 리뷰중 / 완료 / 보류
- 이슈 상태(Open/Closed)와 이 표의 상태가 다르면 이 표를 갱신한다(이슈가 Closed면 완료로 맞춘다).

## 선행 조건

> **[범용 알림 시스템](../notification-system/tasks.md)의 3단계(스키마/API/UI)가 먼저 완료돼야 한다.** 아래 5번(퀴즈 최종 등록 API)이 그 시스템의 알림 생성 함수를 호출하는 소비자이기 때문이다. 알림 관련 작업은 전부 그 문서에서 트래킹하고, 이 문서에는 알림 설계를 두지 않는다.

## 백엔드

| # | 단계 | 이슈 | 상태 | 비고 |
|---|---|---|---|---|
| 1 | 스키마: Quiz.CRT_USER_KEY 컬럼 마이그레이션 | [#150](https://github.com/erjin-lee/song-quiz/issues/150) | 완료(`migration:run`은 사람이 해야 함) | 다른 단계의 선행 조건 |
| 2 | 멜론 곡 검색 + 곡/아티스트/앨범 멱등 등록 | [#142](https://github.com/erjin-lee/song-quiz/issues/142) | 완료 | |
| 3 | 유튜브 링크 검증(형식/정규화/콘텐츠 매칭) + 자동 스크래핑 | [#143](https://github.com/erjin-lee/song-quiz/issues/143) | 완료 | 즉시 검증 API 포함 |
| 4 | 정답 처리: 기존 정답 재사용 + 규칙 기반 자동 생성 | [#144](https://github.com/erjin-lee/song-quiz/issues/144) | 완료 | |
| 5 | 퀴즈 등록 신청 API (24시간 제한, 최소 5곡, 응답 후 백그라운드 안전망 검증 + 완료 알림 호출) | [#145](https://github.com/erjin-lee/song-quiz/issues/145) | 완료 | #142 #143 #144 및 [알림 시스템](../notification-system/tasks.md) 전체 선행 필요 |
| 6 | 소유권 기반 퀴즈 수정/삭제 API | [#148](https://github.com/erjin-lee/song-quiz/issues/148) | 완료 | #150 선행 필요 |
| 7 | 문의 모달에 신고 안내 문구 추가 | [#147](https://github.com/erjin-lee/song-quiz/issues/147) | 완료 | 프런트 텍스트 변경만 |

## 프런트엔드 (`apps/web`)

| # | 단계 | 이슈 | 상태 | 비고 |
|---|---|---|---|---|
| 8 | 진입점 + 로그인 모달 + 등록 가능 여부 사전 확인 | [FE1 #155](https://github.com/erjin-lee/song-quiz/issues/155) | 미착수 | #145 선행 필요(eligibility API) |
| 9 | 퀴즈 만들기/수정 빌더 페이지 골격 | [FE2 #156](https://github.com/erjin-lee/song-quiz/issues/156) | 미착수 | |
| 10 | 곡 검색 UI(DB → 멜론 폴백) + 중복 방지 | [FE3 #157](https://github.com/erjin-lee/song-quiz/issues/157) | 미착수 | #142 선행 필요 |
| 11 | 곡별 링크·정답 편집 모달 + 비동기 검증 | [FE4 #158](https://github.com/erjin-lee/song-quiz/issues/158) | 미착수 | #143 #144 선행 필요 |
| 12 | 빌더 진행 상태 로컬스토리지 임시 저장 | [FE5 #159](https://github.com/erjin-lee/song-quiz/issues/159) | 미착수 | |
| 13 | 마이페이지 - 내 퀴즈 목록(수정/삭제) | [FE6 #160](https://github.com/erjin-lee/song-quiz/issues/160) | 미착수 | #148 선행 필요. "알림" 탭은 [알림 시스템 #154](https://github.com/erjin-lee/song-quiz/issues/154)에서 만든 컴포넌트를 배치만 함 |

## 구현 메모(백엔드)

- **마이그레이션**: [`1788400000000-AddQuizCrtUserKey.ts`](../../../apps/api/src/migrations/1788400000000-AddQuizCrtUserKey.ts)도 이 작업 환경에서 bastion 터널 접근이 안 돼 손으로 작성했다(`DB_INFO.txt` DDL 참고). **실제 반영 전 `migration:generate`로 diff 확인 + 사람이 `migration:run` 실행 필요**(알림 시스템 때와 동일한 사유). [`docs/db-changelog.md`](../../db-changelog.md)에 등록해뒀다.
- **멜론 곡 검색**(#142): 실제 `melon.com/search/song/index.htm` 페이지를 직접 호출해 HTML 구조를 확인한 뒤 셀렉터를 작성했다(`#artistName`에 화면용 링크 + 툴팁용 숨김 `<span>` 중복이 있어 `.children('a')`로 직계만 취함 — 앨범 파서의 기존 패턴과 동일). 새 엔드포인트는 순환 의존을 피하기 위해 `quiz` 모듈이 아니라 기존처럼 `scraper` 모듈에 추가했다(`scraper → quiz` 방향 유지).
- **유튜브 링크 검증**(#143): 기존 `inquiry/youtube-url.util.ts`(ADR-0009 URL 검증 로직)를 `common/`으로 옮겨 `quiz` 모듈과 공유하도록 정리했다. `YoutubeScraperClient.getVideoInfo`가 이미 있어 재사용했고, `stripFeatAnnotations`/`toComparableText`(신규, `song-title-normalizer.ts`)로 곡 제목-영상 제목 대조와 정답 정규화를 같은 유틸로 처리한다.
- **안전망 재검증**(#145): 최종 등록 시 각 곡에 `linkSource: 'MANUAL' | 'AUTO'`를 함께 받아서, 자동 검색으로 채운 링크는 백그라운드 재검증에서 제목 매칭을 건너뛴다(스펙 3.3의 "자동 등록 결과는 제목 매칭 검증 대상에서 제외" 반영). 저장되는 URL은 클라이언트가 보낸 문자열이 아니라 항상 videoId로 재구성한 값이다(ADR-0009 원칙, 테스트로 확인).
- **퀴즈 수정**(#148): 부분 upsert 대신 기존 출제곡/정답/아티스트 연결을 전부 지우고 새 목록으로 다시 만드는 방식으로 구현했다(스펙 4.2 "클라이언트가 계산한 최종 리스트를 그대로 반영"을 가장 단순하게 만족). quizSongId가 수정할 때마다 바뀌지만, 라운드 데이터는 게임 시작 시점에 스냅샷되므로(ARCHITECTURE.md) 영향 없음.
- **QuizArtist 채우기**: 조사 중 `QuizArtist`(SQ_QUIZ_ATST, "퀴즈 대상 아티스트")가 이미 존재하고 `QuizService.getQuizzes`의 아티스트 검색이 이 테이블을 참조한다는 걸 확인했다 — 스펙에 명시돼 있지 않았지만, 유저 등록 퀴즈도 아티스트로 검색되게 하려면 필요해서 등록/수정 시 함께 채우도록 추가했다.
- 유닛 테스트 총 44건 추가(`song-title-normalizer`, `youtube-link-validation.service`, `melon-scraper.client`(searchSongs), `melon-song-search.service`, `user-quiz-registration.service`). `yarn workspace api test`(306건) / `build` / `lint` 전체 통과 확인.

## 폐기된 이슈

| 이슈 | 폐기 사유 |
|---|---|
| [#146](https://github.com/erjin-lee/song-quiz/issues/146) (등록 실패 알림 저장+조회) | 범용 알림 시스템으로 범위 확장 → [알림 시스템](../notification-system/tasks.md)으로 완전히 이관 |
| [#149](https://github.com/erjin-lee/song-quiz/issues/149) (프론트엔드 설계 placeholder) | UI/UX 설계 확정 후 FE1~FE6([#155](https://github.com/erjin-lee/song-quiz/issues/155)~[#160](https://github.com/erjin-lee/song-quiz/issues/160))로 구체화 |

전체 이슈: [milestone "로그인 유저 퀴즈 등록 기능"](https://github.com/erjin-lee/song-quiz/milestone/1)

## 갱신 이력

- 2026-09-02: 문서 확정, 이슈 9개 생성.
- 2026-09-02: UI/UX 논의 반영 — 알림을 범용 시스템으로 분리, 신고를 문의 모달 재사용으로 축소, 최소 5곡·즉시 검증·마이페이지 등 반영. 이슈 재구성(#146·#149 폐기, #147 재활용, FE1~FE6 신규 생성). 이슈 생성 스크립트 버그로 제목이 한 칸씩 밀렸던 것을 바로잡음(본문/번호 참조는 원래부터 정상이었음).
- 2026-09-02: 알림 관련 설계/작업을 이 문서에서 완전히 제거하고 [알림 시스템](../notification-system/spec.md) 문서로 이관, 그 문서를 선행 조건으로 명시. 실제 발송 호출은 #145에 흡수하고 #153은 폐기.
- 2026-09-02: `POST /quizzes`의 안전망 재검증을 동기 → 비동기(백그라운드)로 변경(직접 입력 링크가 많으면 응답이 느려지는 문제). 등록 버튼 클릭 직후 문구를 "등록 완료"가 아니라 "등록 신청" 뉘앙스로 변경. 알림 타입을 실패 전용(`QUIZ_REG_FAILED`)에서 완료 시 항상 발송(`QUIZ_REG_COMPLETED`, 제외 곡 있으면 제목/내용에 반영)으로 통합.
- 2026-09-02: 백엔드 1~7단계(#150, #142~#145, #148, #147) 구현 완료. 알림 시스템 완료 후 착수 순서대로 진행. 프런트엔드(FE1~FE6)는 별도 착수.
