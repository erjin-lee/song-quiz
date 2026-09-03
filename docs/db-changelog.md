# DB 변경 이력 색인

`apps/api/src/migrations/`에 쌓이는 마이그레이션을 시간순으로 훑어볼 수 있는 색인이다. 이 문서 자체는 아무 내용도 새로 설명하지 않는다 — "지금 스키마가 어떤지"는 `apps/api/DB_INFO.txt`(로컬 전용)가, "왜 이 변경이 필요했는지"는 마이그레이션 파일 헤더 주석과 관련 기능 문서가 담당하고, 여기는 그것들로 가는 링크만 한 줄씩 쌓는다.

새 마이그레이션을 추가하면 이 표에도 한 줄 추가한다.

| 날짜 | 마이그레이션 | 설명 | 관련 문서 |
|---|---|---|---|
| 2026-08-31 | [`InitialBaseline`](../apps/api/src/migrations/1788182355318-InitialBaseline.ts) | 마이그레이션 도입 시점의 baseline 마커(실제 DDL 없음) | - |
| 2026-09-01 | [`DropInquiryLegacyClassificationColumns`](../apps/api/src/migrations/1788184823041-DropInquiryLegacyClassificationColumns.ts) | `SQ_INQUIRY`의 구 1/2단계 판별 컬럼(CONFIDENCE/MATCHED_ARGS/MATCHED_FUNCTION) 제거 — `SQ_INQUIRY_ACTION`이 대체 | - |
| 2026-09-01 | [`CreateAlbmAtstAndSongAtstTables`](../apps/api/src/migrations/1788191000000-CreateAlbmAtstAndSongAtstTables.ts) | `SQ_ALBM_ATST`/`SQ_SONG_ATST`(앨범/곡 다대다 아티스트 관계 테이블) 생성 | - |
| 2026-09-01 | [`BackfillSongAlbumArtistLinks`](../apps/api/src/migrations/1788191795553-BackfillSongAlbumArtistLinks.ts) | 정션 테이블 도입 이전 곡/앨범 행의 대표 아티스트를 백필 | - |
| 2026-09-02 | [`Notification`](../apps/api/src/migrations/1788328901865-notification.ts) | `SQ_NOTI`/`SQ_NOTI_READ`(알림 마스터 + 유저별 읽음 여부) 생성 | [범용 알림 시스템](features/notification-system/spec.md) |
| 2026-09-03 | [`AddQuizCrtUserKey`](../apps/api/src/migrations/1788437170629-AddQuizCrtUserKey.ts) | `SQ_QUIZ.CRT_USER_KEY`(등록한 유저) 컬럼 추가 — `migration:generate`로 재생성 후 `migration:run` 완료. 이전에 손으로 작성했던 동명의 `1788400000000` 파일은 실행된 적이 없어 안전하게 이 파일로 교체함 | [로그인 유저 퀴즈 등록](features/user-quiz-registration/spec.md) |
