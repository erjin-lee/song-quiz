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
| 8 | 진입점 + 로그인 모달 + 등록 가능 여부 사전 확인 | [FE1 #155](https://github.com/erjin-lee/song-quiz/issues/155) | 완료 | #145 선행 필요(eligibility API) |
| 9 | 퀴즈 만들기/수정 빌더 페이지 골격 | [FE2 #156](https://github.com/erjin-lee/song-quiz/issues/156) | 완료 | |
| 10 | 곡 검색 UI(DB → 멜론 폴백) + 중복 방지 | [FE3 #157](https://github.com/erjin-lee/song-quiz/issues/157) | 완료 | #142 선행 필요. DB 검색 API(`GET /songs/search`)가 없어서 백엔드에 함께 추가했다 |
| 11 | 곡별 링크·정답 편집 모달 + 비동기 검증 | [FE4 #158](https://github.com/erjin-lee/song-quiz/issues/158) | 완료 | #143 #144 선행 필요 |
| 12 | 빌더 진행 상태 로컬스토리지 임시 저장 | [FE5 #159](https://github.com/erjin-lee/song-quiz/issues/159) | 완료 | |
| 13 | 마이페이지 - 내 퀴즈 목록(수정/삭제) | [FE6 #160](https://github.com/erjin-lee/song-quiz/issues/160) | 완료 | #148 선행 필요. "알림" 탭은 [알림 시스템 #154](https://github.com/erjin-lee/song-quiz/issues/154)에서 만든 `NotificationBell`과 같은 API(`GET /notifications`)를 리스트 형태로 재사용 |

## 구현 메모(백엔드)

- **마이그레이션**: 처음엔 이 작업 환경에서 bastion 터널 접근이 안 돼 `1788400000000-AddQuizCrtUserKey.ts`를 손으로 작성했다(`DB_INFO.txt` DDL 참고). 이후 실제로 bastion 터널을 거쳐 `migration:generate`로 재생성한 [`1788437170629-AddQuizCrtUserKey.ts`](../../../apps/api/src/migrations/1788437170629-AddQuizCrtUserKey.ts)로 교체하고 `migration:run`까지 완료했다(사람이 직접 실행) — 손으로 쓴 파일은 한 번도 실행된 적이 없어서 안전하게 교체할 수 있었다. **앞으로는 이미 머지·실행된 마이그레이션 파일의 타임스탬프/내용을 바꾸지 않는다** — 이미 실행한 환경이 있으면 TypeORM이 새 파일명을 미실행으로 인식해 중복 컬럼 에러로 실패한다(코드 리뷰 지적). 보정이 필요하면 항상 새 파일을 추가한다. [`docs/db-changelog.md`](../../db-changelog.md)에 등록해뒀다.
- **멜론 곡 검색**(#142): 실제 `melon.com/search/song/index.htm` 페이지를 직접 호출해 HTML 구조를 확인한 뒤 셀렉터를 작성했다(`#artistName`에 화면용 링크 + 툴팁용 숨김 `<span>` 중복이 있어 `.children('a')`로 직계만 취함 — 앨범 파서의 기존 패턴과 동일). 새 엔드포인트는 순환 의존을 피하기 위해 `quiz` 모듈이 아니라 기존처럼 `scraper` 모듈에 추가했다(`scraper → quiz` 방향 유지).
- **유튜브 링크 검증**(#143): 기존 `inquiry/youtube-url.util.ts`(ADR-0009 URL 검증 로직)를 `common/`으로 옮겨 `quiz` 모듈과 공유하도록 정리했다. `YoutubeScraperClient.getVideoInfo`가 이미 있어 재사용했고, `stripFeatAnnotations`/`toComparableText`(신규, `song-title-normalizer.ts`)로 곡 제목-영상 제목 대조와 정답 정규화를 같은 유틸로 처리한다.
- **안전망 재검증**(#145): 저장되는 videoId/재생 구간은 클라이언트가 보낸 값이 아니라 서버가 `youtubeUrl`을 다시 파싱해서 계산한 값만 쓴다(ADR-0009, 테스트로 확인) — 처음엔 `youtubeVideoId`를 별도 필드로 클라이언트에게 받아 저장했는데, 코드 리뷰에서 "URL과 다른 videoId를 보내 검증은 통과시키고 실제로는 다른 영상을 등록할 수 있다"는 지적을 받고 그 필드 자체를 없앴다.
- **자동 검색 결과의 제목 매칭 예외**(#143, #145, spec.md 3.3-③): "자동 등록 링크는 안전망에서 제목 매칭을 생략한다"는 걸 처음엔 클라이언트가 보내는 `linkSource` 플래그로 판단했는데, 그 플래그 자체가 클라이언트 입력이라 콘텐츠 검증을 우회하는 데 악용될 수 있어(코드 리뷰 지적) 한 번 완전히 제거하고 안전망이 항상 전체 검증을 하도록 바꿨다. 그런데 그렇게 하면 스펙이 원래 의도한 "자동 검색 결과는 예외" 자체가 사라져서, 실제로 자동 검색이 찾은 영상(제목이 멜론 곡명과 표기만 다른 경우 등)이 등록 후 조용히 빠지는 문제가 다시 지적됐다. 최종적으로 [`link-verification-token.util.ts`](../../../apps/api/src/quiz/link-verification-token.util.ts)로 해결: `.../youtube-link/auto`가 songId+videoId+source(`AUTO`)를 서버가 서명한 토큰을 함께 돌려주고, 최종 등록 요청의 같은 곡 입력에 그 토큰을 실어 보내면 안전망이 서명·songId·videoId·만료를 검증한 뒤에만 제목 매칭을 생략한다. 토큰이 없거나 다른 곡/영상용이거나 위조·만료됐으면 항상 전체 검증(secure by default). 시크릿은 `USER_JWT_SECRET`을 재사용하되 payload에 `purpose` 필드를 둬서 로그인 JWT와 구분한다(새 시크릿을 운영에 추가 배포할 필요 없음).
- **즉시 검증을 우회한 등록 차단 + 토큰 필수화**(2차 코드 리뷰): 위 토큰을 처음엔 AUTO에만 발급하고 최종 등록 시에도 선택 항목으로 뒀는데, 그러면 유저가 `.../youtube-link/validate`(직접 입력 즉시 검증)를 아예 안 거치고 형식만 맞는 아무 유튜브 URL이나 `POST /quizzes`에 바로 제출해도 퀴즈가 즉시 만들어지고 공개된다는 지적을 받았다(스펙 4.1 "최종 등록 조건: 모든 곡에 유효성 검증을 통과한 링크가 있어야" 위반 — 안전망은 비동기라 그 사이엔 걸러지지 않는다). 그래서 `.../youtube-link/validate`(직접 입력)도 성공 시 MANUAL 토큰을 발급하도록 바꾸고, `CreateQuizSongInputDto.verificationToken`을 필수 필드로 바꿨다 — 이제 모든 곡은 songId+videoId가 일치하는 유효한 토큰(MANUAL 또는 AUTO) 없이는 생성도 수정도 안 되고, 없거나 위조·만료됐으면 그 즉시 `BadRequestException`으로 거부한다. 부수 효과로 "다음날 퀴즈 수정 시 AUTO 출처를 알 수 없다"는 별도 지적도 함께 해결됐다 — AUTO 상태를 DB에 영속화하는 대신, 수정(PATCH)도 매번 모든 곡에 대해 방금 재검증한 토큰을 새로 요구하므로 오래된/불확실한 상태를 추측하는 경로 자체가 없다(빌더 UI는 수정 시에도 각 곡의 링크를 다시 검증/자동 채우기 해서 새 토큰을 받아야 한다 — FE 작업 시 반영 필요).
- **트랜잭션 + 동시성**(#145): 퀴즈 생성/수정의 여러 테이블 쓰기를 트랜잭션 하나로 묶었다(중간 실패 시 부분 데이터가 안 남도록). 24시간 등록 제한은 등록 유저(SQ_USER) 행에 비관적 락(`pessimistic_write`)을 걸어, 같은 유저의 동시 요청이 순차적으로만 처리되게 했다(두 탭에서 동시에 등록 시도해도 하나만 통과). 등록 가능 여부 단순 조회(`GET /quizzes/registration-eligibility`)는 트랜잭션 밖에서 호출되므로 이 락을 걸지 않는다 — 비관적 락은 활성 트랜잭션이 없으면 TypeORM이 예외를 던지는데, 처음엔 이 조회에도 무조건 락을 걸어서 해당 API가 항상 500으로 실패하던 버그가 있었다(코드 리뷰 지적으로 발견, 락 여부를 옵션으로 분리해 수정).
- **퀴즈 수정**(#148): 부분 upsert 대신 기존 출제곡/정답/아티스트 연결을 전부 지우고 새 목록으로 다시 만드는 방식으로 구현했다(스펙 4.2 "클라이언트가 계산한 최종 리스트를 그대로 반영"을 가장 단순하게 만족). quizSongId가 수정할 때마다 바뀌지만, 라운드 데이터는 게임 시작 시점에 스냅샷되므로(ARCHITECTURE.md) 영향 없음. 대상 퀴즈 행에도 비관적 락을 걸고 트랜잭션으로 묶었다.
- **멜론 곡 등록 신뢰 경계**(#142): 처음엔 `POST /songs/from-melon`이 곡명/앨범명/아티스트명을 요청 바디로 그대로 받아 저장했는데, melonSongId 등이 unique 키라서 한 번 조작된 이름으로 선점되면 그 멜론 ID를 검색하는 모든 유저에게 영구적으로 남는다는 지적을 받았다. `GET /melon/songs/search` 응답을 melonSongId별로 서버 캐시(`CacheService`, 10분 TTL)에 저장해두고, 등록 요청은 melonSongId만 받아 캐시된 값만 신뢰하도록 바꿨다. 이 캐시는 등록을 허용하는 유일한 증빙이라, 여러 ECS 태스크가 떠 있는 운영 환경에서 Redis 오류를 프로세스 로컬 캐시로 조용히 폴백하면(`CacheService.get/set`) 검색을 처리한 태스크와 등록을 처리한 태스크가 달라 "검색 결과 만료"로 실패할 수 있다는 지적을 받고 `getStrict`/`setStrict`(폴백 없이 오류를 그대로 던지는 버전)로 바꿨다. 곡/앨범 저장과 아티스트 연결(`ArtistLinkService`)도 트랜잭션 하나로 묶어서, 연결 저장이 실패했는데 곡 저장은 성공한 걸 재조회로 "성공"이라 오인하던 버그도 함께 고쳤다(`ArtistLinkService`가 외부 트랜잭션 manager를 선택적으로 받도록 확장). 동시에 같은 신규 곡이 등록돼 unique 충돌이 나면 같은 트랜잭션 안에서 재조회하는데, 처음엔 일반 조회를 써서 MySQL REPEATABLE READ 스냅샷 때문에 방금 다른 트랜잭션이 커밋한 행을 못 보고 원래 에러를 다시 던지는 버그가 있었다 — 비관적 락 조회(최신 커밋본을 읽음)로 바꾸고, 실제 duplicate 에러(`ER_DUP_ENTRY`)일 때만 재조회하도록 catch 범위도 좁혔다.
- **QuizArtist 채우기**: 조사 중 `QuizArtist`(SQ_QUIZ_ATST, "퀴즈 대상 아티스트")가 이미 존재하고 `QuizService.getQuizzes`의 아티스트 검색이 이 테이블을 참조한다는 걸 확인했다 — 스펙에 명시돼 있지 않았지만, 유저 등록 퀴즈도 아티스트로 검색되게 하려면 필요해서 등록/수정 시 함께 채우도록 추가했다.
- 코드 리뷰 세 라운드를 거치며 유닛 테스트를 계속 보강했다(신규 파일: `link-verification-token.util.spec.ts`, `user-song.service.spec.ts` 포함). `yarn workspace api test`(36 suites, 331건) / `build` / `lint` 전체 통과 확인.

## 구현 메모(프런트엔드)

- **작업 중 발견한 백엔드 공백 3건**: 프런트를 실제로 붙여보기 전까지는 몰랐던 빈 곳들이라 백엔드 쪽에 최소한만 추가했다(전부 읽기 전용 조회, 새 쓰기 로직 없음).
  - `GET /songs/search?keyword=`(`UserSongService.searchSongs`): spec.md 3.1의 "1차: 기존 DB에서 제목/아티스트명으로 검색"이 실제로는 구현돼 있지 않았다 — 멜론 검색(2차)만 있었다.
  - `GET /quizzes/mine`(`UserQuizRegistrationService.getMyQuizzes`): 로그인 유저 본인 퀴즈만 골라서 곡 수와 함께 보여주는 마이페이지 전용 목록. 기존 `GET /quizzes`(전체 공개 목록)로는 만들 수 없었다.
  - `GET /quizzes/:quizId`(`UserQuizRegistrationService.getQuizForEdit`): 수정 화면 진입 시 기존 제목/설명/곡/링크/정답을 불러와 프리필하는 용도. 소유권 확인(본인 퀴즈 아니면 403)을 포함하며, 곡 목록 조회는 기존 `QuizService.getQuizSongs`를 재사용했다. 이 라우트는 `UserQuizRegistrationController`의 `GET mine`보다 반드시 뒤에 선언해야 한다 - `:quizId` 파라미터 라우트가 먼저면 `/quizzes/mine` 요청도 `quizId='mine'`으로 잘못 매칭된다(Express는 라우트를 선언 순서대로 매칭).
- **검증 토큰이 진짜로 필요해진 이유(빌더 UX에 직결)**: 백엔드가 이미 "모든 곡은 최근에 검증받은 토큰이 있어야 등록/수정 가능"으로 강제하기 때문에, 프런트도 곡을 담을 때마다 링크 편집 모달 → "확인" → 서버 검증 → ✅ 상태가 되는 흐름을 반드시 거치게 만들었다. 수정 화면은 `GET /quizzes/:quizId`가 조회 시점에 재검증+토큰 발급까지 해주므로(2026-09-03 개선, 아래 코드 리뷰 5차 참고) 대부분의 곡이 바로 확인 완료 상태로 시작하고, 재검증에 실패한 소수만 다시 확인하면 된다.
- **곡 카드 상태 머신**: `unverified`(❔, 아직 확인 안 함) → `checking`(⏳, 서버 검증 중) → `valid`(✅) | `invalid`(⚠️, 카드에 마우스 올리면 사유 툴팁). 링크를 다시 입력하거나 자동 검색을 다시 트리거하면 다시 `checking`으로 돌아간다. 등록/수정 버튼은 `songs.length >= 5 && songs.every(valid && 정답 1~10개)`일 때만 활성화된다(spec.md 3.3 최종 등록 조건 + 서버 DTO의 `ArrayMinSize(1)`/`ArrayMaxSize(10)`을 클라이언트에서도 미리 막음 - 실제 강제는 서버가 한다). 곡별 검증 요청에는 순번을 매겨서, 링크를 빠르게 두 번 바꿔 저장했을 때 먼저 보낸 요청의 응답이 나중에 도착해도 최신 상태를 덮어쓰지 않게 했다.
- **로컬스토리지 임시 저장**(4.5, `utils/quizDraft.ts`, 기존 `roomSession.ts`와 동일 패턴): 새 퀴즈(`song-quiz:quiz-draft:new`)와 퀴즈별 수정(`song-quiz:quiz-draft:edit:{quizId}`)의 키를 분리해서, 새 퀴즈를 작성하다가 다른 탭에서 기존 퀴즈를 수정해도 서로 덮어쓰지 않는다. 초안이 있으면 항상 서버 재조회보다 초안을 우선한다(진행 중이던 미확인 링크/정답까지 그대로 복구하기 위함) - 검증 토큰도 초안에 그대로 저장되지만, 토큰 자체가 짧은 TTL(1시간)로 서명되어 있어 오래된 초안을 불러와도 만료된 토큰은 서버가 알아서 거부한다(별도 만료 처리 로직 불필요).
- **멜론 검색으로 담은 곡의 아티스트 표시명**: `POST /songs/from-melon`의 응답(`RegisteredSongDto`)에는 아티스트명이 없어서(트러스트 경계상 서버가 캐시한 값만 신뢰 - 코드 리뷰 참고), 검색 결과 자체(`MelonSongSearchResultDto.artists`)에서 화면 표시용 아티스트명만 따로 꺼내 썼다(등록 자체는 melonSongId만으로 이뤄지므로 이 표시명이 실제 저장에 영향을 주지 않는다).
- **마이페이지 알림 탭**: 새 UI를 만들지 않고 `NotificationBell`이 쓰는 것과 같은 `GET /notifications` 응답을 그대로 리스트로 펼쳐서 보여준다(spec.md 4.6 의도 그대로).
- **마이페이지 진입점**: 방 목록 화면의 로그인 유저 메뉴(닉네임 옆, "게임 방법"·"로그아웃"과 같은 줄)에 "마이페이지" 버튼을 추가했다 — 처음엔 등록 직후 자동 이동 경로만 있고 되돌아갈 진입점이 없었다(코드 리뷰 지적).
- **미검증 항목**: 이 환경에서는 bastion 터널로 실 DB에 붙을 수 없고 로컬 Redis도 띄워져 있지 않아(`REDIS_HOST` 미설정 시 로컬 메모리 폴백은 되지만, 이번엔 그 폴백 단계 이전에 API 서버 자체가 Socket.IO Redis 어댑터 연결 실패로 부팅을 못 했다), 브라우저로 실제 클릭해가며 검증하지는 못했다. 타입 체크(`tsc -b`)와 `vite build`, 신규 컴포넌트 테스트(React Testing Library)로만 검증했다 - 실제 배포 환경에서 한 번은 꼭 수동으로 전체 플로우를 훑어봐야 한다.
- 신규 프런트 테스트: `QuizBuilderPage.test.tsx`(11), `MyPage.test.tsx`(8), `quizDraft.test.ts`(7), `RoomListPage.test.tsx`에 4건 추가, `client.test.ts`에 `apiDelete` 1건 추가. `yarn workspace web test`(20 files, 123건) / `yarn web:build` / `yarn workspace web lint` 전체 통과 확인.
- **코드 리뷰 5차(2026-09-03)에서 고친 것**:
  1. 마이그레이션 파일 타임스탬프 문제 — 아래 "마이그레이션" 항목 참고(사용자가 직접 교체+실행함, 문서만 정정).
  2. `GET /quizzes/:quizId`가 재생용으로 1초 앞당긴 URL(`QuizService.getQuizSongs`의 `shiftYoutubeUrlStartSecEarlier`)을 그대로 편집용으로 돌려줘서, 링크를 안 건드리고 수정만 해도 저장할 때마다 시작 지점이 1초씩 계속 줄어드는 버그 — `youtubeVideoId`+원본 `startSec`으로 URL을 다시 조합하도록 수정.
  3. `canSubmit`이 정답 개수(서버 DTO 기준 1~10개)를 확인하지 않아서, 링크가 없는 곡을 "자동으로 찾기"만으로 채우면(정답은 그대로 `[]`) 카드는 ✅인데 서버가 `ArrayMinSize(1)`에서 거부하는 상황이 가능했음 — `canSubmit`에 정답 개수 검사 추가, 자동 채우기 성공 시 정답 후보를 함께 채워주기, 모달/후보 API 양쪽에 10개 상한 반영.
  4. 곡별 링크 검증 요청에 순번이 없어서, 응답 순서가 뒤바뀌면(느린 이전 요청이 나중에 도착) 오래된 링크가 최신 상태를 덮어쓸 수 있었음 — 곡별 요청 순번을 추적해 최신 요청의 응답만 반영하도록 수정.
  5. 마이페이지로 돌아갈 진입점 부재 — 위 "마이페이지 진입점" 항목 참고.

## 아직 안 고친 것(별도 결정 필요)

코드 리뷰에서 나왔지만 아키텍처 결정이 필요하거나 우선순위상 미루기로 한 항목들. 고칠 때는 이 목록에서 지운다.

- **안전망 재검증 유실 위험**: `void this.runBackgroundSafetyNet(...)`이 여전히 프로세스 메모리의 fire-and-forget 작업이라, 배포/재시작 중에는 유실될 수 있다. SQS/BullMQ 같은 큐 인프라를 새로 들이는 건 이 코드베이스에 없는 아키텍처 결정이라 임의로 진행하지 않고 별도로 확인 후 진행하기로 함(A안: 지금은 보류하기로 결정).
- **검증 토큰이 재생 시작 시점(startSec)을 보증하지 않음**: [`link-verification-token.util.ts`](../../../apps/api/src/quiz/link-verification-token.util.ts)의 토큰은 songId+videoId만 서명하고 startSec은 서명 대상이 아니다. [`saveQuizSongsAndAnswers`](../../../apps/api/src/quiz/user-quiz-registration.service.ts)는 최종 요청의 `youtubeUrl`에서 startSec을 매번 새로 파싱해서 쓰므로, `t=10`으로 검증받은 뒤 같은 토큰과 `t=999999`가 붙은 URL을 제출하면 토큰 검증은 그대로 통과하고 `startSec=999999`(영상 길이를 벗어나 재생 불가한 구간)로 퀴즈가 즉시 공개된다. 안전망이 나중에 보정하지만, 그 사이엔 재생할 수 없는 퀴즈가 노출된다. 권장 수정 방향: 토큰에 정규화된 startSec(또는 전체 정규화 URL)도 서명해 최종 요청과 대조하거나, 제출 URL의 시작 시점은 무시하고 토큰에 서명된 값만 저장하도록 바꾸기 — 시작 시점 변조 테스트도 함께 추가해야 한다.
- **기존 AUTO 링크를 그대로 둔 채 다른 필드만 수정하는 경로가 막혀 있음** — **대부분 완화됨(2026-09-03)**: 원래는 수정 화면에 들어가면 모든 곡이 토큰 없이(미확인 상태로) 시작해서, 단순히 설명만 고쳐도 곡마다 일일이 다시 확인해야 했다. 지금은 [`GET /quizzes/:quizId`](../../../apps/api/src/quiz/user-quiz-registration.service.ts)가 응답 시점에 각 곡을 서버가 직접 재검증해서(콘텐츠 매칭 포함) 통과한 곡은 토큰까지 함께 내려주므로, 빌더가 열리자마자 대부분의 곡이 바로 "확인 완료(✅)"로 채워진다. 다만 이건 어디까지나 "지금 다시 검증해서 통과하는가"를 매번 새로 판단하는 것이라, 원래 AUTO로 등록됐고 영상 제목이 곡명과 표기가 크게 다른 소수의 곡은 여전히 이 재검증에서 실패(⚠️)로 뜰 수 있다 — 이 경우엔 유저가 "자동으로 찾기"를 다시 누르거나 링크를 직접 확인해야 한다. `QuizSong`에 출처(MANUAL/AUTO)를 영속화하는 근본 해결책은 여전히 하지 않았다(스키마 변경 필요, 별도 결정 사항으로 남겨둠) — 실제로 이 정도의 잔여 불편이 문제가 되는지 지켜보고 필요하면 진행.

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
- 2026-09-03: 코드 리뷰 4차 - 검증 토큰의 startSec 미보증, 기존 AUTO 링크 재검증 경로 부재 2건을 "아직 안 고친 것"에 문서화만 하고 이번 라운드에서는 수정하지 않기로 함(별도 확인 후 진행).
- 2026-09-03: 프런트엔드 8~13단계(FE1~FE6, #155~#160) 구현 완료. 진행 중 발견한 백엔드 공백 3건(DB 곡 검색, 마이페이지 내 퀴즈 목록, 수정 화면 프리필용 상세 조회 API)을 함께 추가. 브라우저로 직접 클릭해보는 수동 검증은 로컬 DB/Redis 접근 제약으로 못 했고, 타입 체크·빌드·유닛 테스트로만 확인함 - 배포 후 수동 확인 필요.
- 2026-09-03: 수정 화면 진입 시 기존 곡이 전부 "미확인" 상태로 뜨던 걸 개선 — `GET /quizzes/:quizId`가 조회 시점에 각 곡을 서버에서 다시 검증해서 통과한 곡은 토큰까지 함께 내려주도록 변경. "아직 안 고친 것"의 AUTO 링크 재검증 항목이 대부분 완화됨(완전히 해결된 건 아님, 해당 항목 참고).
- 2026-09-03: 코드 리뷰 5차 - 마이그레이션 파일 교체 관련 문서 정정(사용자가 직접 bastion 터널로 재생성+실행 완료), 수정 화면 URL이 편집할 때마다 재생 시작 지점을 1초씩 깎아먹던 버그 수정, 프런트 `canSubmit`에 정답 개수(1~10) 검사 추가 및 자동 채우기 시 정답 후보 자동 채움, 곡별 검증 요청 응답 순서 뒤바뀜 방지(요청 순번 추적), 마이페이지 진입 버튼 추가.
