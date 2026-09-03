/** 유저가 직접 등록하는 퀴즈의 최소 출제곡 수. */
export const MIN_USER_QUIZ_SONG_COUNT = 5;

/** 유저 1명당 퀴즈 등록 제한 주기(24시간, 롤링 윈도우). */
export const QUIZ_REGISTRATION_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * 임시 비활성화(2026-09-03) - 여러 유저가 동시에 퀴즈를 등록/수정하면 유튜브
 * 스크래핑 요청(영상 정보 조회 · 자동 검색)이 짧은 시간에 몰려서 유튜브
 * 쪽에서 차단될 위험이 있다. 등록 신청을 큐에 넣고 하나씩 순차 처리하는
 * 방식으로 바뀌면 다시 켠다(큐 자체는 아직 만들지 않음 - 별도 작업).
 *
 * false인 동안:
 * - `YoutubeLinkValidationService.validate()`는 형식(ADR-0009, videoId
 *   추출)만 확인하고 실제 스크래핑·제목 대조 없이 항상 통과시킨다 -
 *   클라이언트가 보낸 원본 URL을 그대로 신뢰하는 게 아니라 videoId로 다시
 *   조합한 URL만 저장하므로 ADR-0009의 신뢰 경계 자체는 그대로 유지된다.
 * - `UserSongService.autoFillYoutubeLink()`(자동 찾기)는 검색을 시도하지
 *   않고 항상 "찾지 못함"으로 응답한다.
 */
export const YOUTUBE_LINK_VERIFICATION_ENABLED = false;
