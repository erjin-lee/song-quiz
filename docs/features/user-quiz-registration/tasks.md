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
- **안전망 재검증**(#145): 저장되는 videoId/재생 구간은 클라이언트가 보낸 값이 아니라 서버가 `youtubeUrl`을 다시 파싱해서 계산한 값만 쓴다(ADR-0009, 테스트로 확인) — 처음엔 `youtubeVideoId`를 별도 필드로 클라이언트에게 받아 저장했는데, 코드 리뷰에서 "URL과 다른 videoId를 보내 검증은 통과시키고 실제로는 다른 영상을 등록할 수 있다"는 지적을 받고 그 필드 자체를 없앴다.
- **자동 검색 결과의 제목 매칭 예외**(#143, #145, spec.md 3.3-③): "자동 등록 링크는 안전망에서 제목 매칭을 생략한다"는 걸 처음엔 클라이언트가 보내는 `linkSource` 플래그로 판단했는데, 그 플래그 자체가 클라이언트 입력이라 콘텐츠 검증을 우회하는 데 악용될 수 있어(코드 리뷰 지적) 한 번 완전히 제거하고 안전망이 항상 전체 검증을 하도록 바꿨다. 그런데 그렇게 하면 스펙이 원래 의도한 "자동 검색 결과는 예외" 자체가 사라져서, 실제로 자동 검색이 찾은 영상(제목이 멜론 곡명과 표기만 다른 경우 등)이 등록 후 조용히 빠지는 문제가 다시 지적됐다. 최종적으로 [`link-verification-token.util.ts`](../../../apps/api/src/quiz/link-verification-token.util.ts)로 해결: `.../youtube-link/auto`가 songId+videoId+source(`AUTO`)를 서버가 서명한 토큰을 함께 돌려주고, 최종 등록 요청의 같은 곡 입력에 그 토큰을 실어 보내면 안전망이 서명·songId·videoId·만료를 검증한 뒤에만 제목 매칭을 생략한다. 토큰이 없거나 다른 곡/영상용이거나 위조·만료됐으면 항상 전체 검증(secure by default). 시크릿은 `USER_JWT_SECRET`을 재사용하되 payload에 `purpose` 필드를 둬서 로그인 JWT와 구분한다(새 시크릿을 운영에 추가 배포할 필요 없음).
- **트랜잭션 + 동시성**(#145): 퀴즈 생성/수정의 여러 테이블 쓰기를 트랜잭션 하나로 묶었다(중간 실패 시 부분 데이터가 안 남도록). 24시간 등록 제한은 등록 유저(SQ_USER) 행에 비관적 락(`pessimistic_write`)을 걸어, 같은 유저의 동시 요청이 순차적으로만 처리되게 했다(두 탭에서 동시에 등록 시도해도 하나만 통과). 등록 가능 여부 단순 조회(`GET /quizzes/registration-eligibility`)는 트랜잭션 밖에서 호출되므로 이 락을 걸지 않는다 — 비관적 락은 활성 트랜잭션이 없으면 TypeORM이 예외를 던지는데, 처음엔 이 조회에도 무조건 락을 걸어서 해당 API가 항상 500으로 실패하던 버그가 있었다(코드 리뷰 지적으로 발견, 락 여부를 옵션으로 분리해 수정).
- **퀴즈 수정**(#148): 부분 upsert 대신 기존 출제곡/정답/아티스트 연결을 전부 지우고 새 목록으로 다시 만드는 방식으로 구현했다(스펙 4.2 "클라이언트가 계산한 최종 리스트를 그대로 반영"을 가장 단순하게 만족). quizSongId가 수정할 때마다 바뀌지만, 라운드 데이터는 게임 시작 시점에 스냅샷되므로(ARCHITECTURE.md) 영향 없음. 대상 퀴즈 행에도 비관적 락을 걸고 트랜잭션으로 묶었다.
- **멜론 곡 등록 신뢰 경계**(#142): 처음엔 `POST /songs/from-melon`이 곡명/앨범명/아티스트명을 요청 바디로 그대로 받아 저장했는데, melonSongId 등이 unique 키라서 한 번 조작된 이름으로 선점되면 그 멜론 ID를 검색하는 모든 유저에게 영구적으로 남는다는 지적을 받았다. `GET /melon/songs/search` 응답을 melonSongId별로 서버 캐시(`CacheService`, 10분 TTL)에 저장해두고, 등록 요청은 melonSongId만 받아 캐시된 값만 신뢰하도록 바꿨다. 이 캐시는 등록을 허용하는 유일한 증빙이라, 여러 ECS 태스크가 떠 있는 운영 환경에서 Redis 오류를 프로세스 로컬 캐시로 조용히 폴백하면(`CacheService.get/set`) 검색을 처리한 태스크와 등록을 처리한 태스크가 달라 "검색 결과 만료"로 실패할 수 있다는 지적을 받고 `getStrict`/`setStrict`(폴백 없이 오류를 그대로 던지는 버전)로 바꿨다. 곡/앨범 저장과 아티스트 연결(`ArtistLinkService`)도 트랜잭션 하나로 묶어서, 연결 저장이 실패했는데 곡 저장은 성공한 걸 재조회로 "성공"이라 오인하던 버그도 함께 고쳤다(`ArtistLinkService`가 외부 트랜잭션 manager를 선택적으로 받도록 확장). 동시에 같은 신규 곡이 등록돼 unique 충돌이 나면 같은 트랜잭션 안에서 재조회하는데, 처음엔 일반 조회를 써서 MySQL REPEATABLE READ 스냅샷 때문에 방금 다른 트랜잭션이 커밋한 행을 못 보고 원래 에러를 다시 던지는 버그가 있었다 — 비관적 락 조회(최신 커밋본을 읽음)로 바꾸고, 실제 duplicate 에러(`ER_DUP_ENTRY`)일 때만 재조회하도록 catch 범위도 좁혔다.
- **QuizArtist 채우기**: 조사 중 `QuizArtist`(SQ_QUIZ_ATST, "퀴즈 대상 아티스트")가 이미 존재하고 `QuizService.getQuizzes`의 아티스트 검색이 이 테이블을 참조한다는 걸 확인했다 — 스펙에 명시돼 있지 않았지만, 유저 등록 퀴즈도 아티스트로 검색되게 하려면 필요해서 등록/수정 시 함께 채우도록 추가했다.
- 코드 리뷰 두 라운드를 거치며 유닛 테스트를 계속 보강했다(신규 파일: `link-verification-token.util.spec.ts`, `user-song.service.spec.ts` 포함). `yarn workspace api test`(36 suites, 329건) / `build` / `lint` 전체 통과 확인.
- **아직 안 고친 것(별도 결정 필요)**: 안전망 재검증은 여전히 프로세스 메모리의 fire-and-forget 작업(`void this.runBackgroundSafetyNet(...)`)이라, 배포/재시작 중에는 유실될 수 있다. SQS/BullMQ 같은 큐 인프라를 새로 들이는 건 이 코드베이스에 없는 아키텍처 결정이라 임의로 진행하지 않고 별도로 확인 후 진행하기로 함(A안: 지금은 보류하기로 결정).

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
