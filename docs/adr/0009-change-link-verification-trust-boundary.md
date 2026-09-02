# ADR-0009: 문의 CHANGE_LINK 검증의 AI 신뢰 경계 + URL 정규화 저장

- 상태: Accepted
- 관련 코드: [`apps/api/src/inquiry/inquiry-gpt.client.ts`](../../apps/api/src/inquiry/inquiry-gpt.client.ts), [`apps/api/src/inquiry/youtube-url.util.ts`](../../apps/api/src/inquiry/youtube-url.util.ts), [`apps/api/src/inquiry/inquiry-action.service.ts`](../../apps/api/src/inquiry/inquiry-action.service.ts)

## 배경

문의 조치 중 `CHANGE_LINK`(유튜브 링크 교체)는 GPT에게 OpenAI `web_search` 도구를 켜준 뒤, 기존/새 링크의 실제 페이지를 확인해 `confidence`를 판정하게 한다. 그런데 `web_search`는 일반 웹 검색이라 유튜브 영상 페이지 내용을 못 찾는 경우가 잦았고, 이때 GPT가 `confidence: LOW`로 응답하면 `inquiry.service.ts`가 관리자 알림(Slack)도 없이 바로 자동 반려했다 - 정상적인 링크 교체 요청도 처리되지 못하는 문제로 이어졌다.

이를 고치기 위해 "웹 검색으로 확인 못 하면 우리가 직접 스크래핑한 정보로 재판단"하는 폴백을 추가했는데, 코드 리뷰가 반복되며(총 5차례) 다음 문제들이 순서대로 드러났다.

1. 폴백이 영상 **제목**만으로 `HIGH`를 줄 수 있었다 - 유튜브 제목은 업로더가 임의로 정할 수 있어 그것만으로 자동 승인(사람 검토 없이 즉시 실행)까지 갈 근거가 못 된다.
2. 1차 GPT 응답이 프롬프트를 어기고 `{ confidence: "HIGH", linkAccessible: false }`처럼 모순된 값을 낼 수 있는데, 이후 폴백 경로(스크래핑 실패/2차 요청 실패)가 이 값을 그대로 반환해 검증 안 된 `HIGH`가 새어나갈 수 있었다.
3. `parseYoutubeUrl`이 호스트만 검증하고 경로는 검증하지 않아서, `youtube.com` 계열의 `/results?v=x`, `/?v=x` 같은 비영상 경로도 유효한 영상 링크로 통과했다. 폴백은 videoId로 재구성한 `/watch` URL을 스크래핑하는데, 실행 단계는 사용자가 제출한 원본(비영상) URL을 그대로 저장해서 "검증 대상과 저장 대상이 다른" 상태가 됐다.
4. `t`(시작 시간) 파라미터의 음수/영상 길이 초과 값이 정규화된 URL과 DB의 `startSec`/`endSec`에서 서로 다르게(또는 불충분하게) 보정돼, 두 값이 어긋나거나 실제 재생 가능 구간이 의도한 30초보다 훨씬 짧아지는 경우가 있었다.

공통 원인: **AI(web_search/GPT)와 외부 입력(사용자 제출 URL)의 출력을 프롬프트/기대값대로 온다고 가정**했고, 그 가정이 깨지는 경로(모순 응답, 잘못된 URL 형식, 극단적인 값)에 대한 코드 레벨 방어가 없었다.

## 결정

**1) 웹 검색(실제 페이지 접근)은 1차 시도로 유지하되, 실패했을 때만 우리가 직접 스크래핑한 정보로 재판단한다.** GPT가 `linkAccessible: false`를 보고하면(1차 응답의 `confidence` 값과 무관하게) 그 시점부터 `confidence`를 신뢰하지 않고 즉시 `MEDIUM` 이하로 낮춘다 - 이후 스크래핑 성공/실패/2차 요청 성공/실패 중 어떤 경로로 빠지든 이미 안전한 값에서 시작한다.

**2) 스크래핑 정보 기반 폴백 판정은 프롬프트에서도, 코드에서도 `HIGH`를 낼 수 없다.** 실제 페이지에 접근하지 못하고 제목/재생시간 텍스트만으로 판단한 결과이므로 사람 관리자의 최종 검토(`MEDIUM` → Slack 알림)를 반드시 거치게 한다. 프롬프트 지시만으로는 LLM이 지침을 어길 수 있으므로, 폴백 결과가 `HIGH`로 오면 코드에서 `MEDIUM`으로 한 번 더 낮춘다(방어 이중화).

**3) 유튜브 URL은 호스트 + 경로까지 검증한다.** `youtube.com`/`www.youtube.com`/`m.youtube.com`은 정확히 `/watch` 경로일 때만, `youtu.be`는 path segment가 하나일 때만 videoId를 인정한다(hostname은 부분 문자열이 아니라 정확히 일치). `changeLink()` 실행 시 저장하는 `youtubeUrl`은 사용자가 제출한 원본이 아니라 **검증된 videoId(+ 보정된 startSec)로 정규화한 URL**(`buildYoutubeWatchUrl`)이다 - 실제로 스크래핑·재생에 쓰이는 값과 DB에 저장되는 값이 항상 같은 소스에서 나온다.

**4) 시작 시간(`t`/`startSec`)은 파싱 시점(`parseTimeParam`)에 0 이상으로 한 번만 보정하고, 스크래핑된 영상 길이를 알면 `startSec`의 상한도 `durationSec - QUIZ_SONG_CLIP_SEC`(30초 클립이 항상 영상 안에 들어가는 값)으로 제한한다.**

## 근거

- `web_search` 도구가 실제로 유튜브 페이지를 열어보는 게 아니라 색인된 검색 결과에 의존하므로, "확인 못 함"은 예외가 아니라 상시 발생하는 경로로 취급해야 한다.
- LLM 출력은 프롬프트 지시를 어길 수 있다는 전제로, 자동 실행/승인으로 이어지는 판정은 근거의 강도(실제 페이지 접근 vs 제목 텍스트만)에 따라 도달 가능한 `confidence` 상한을 코드에서 강제해야 한다 - 프롬프트 문구만으로는 방어가 안 됐다(실제로 리뷰에서 모순 응답 케이스가 지적됨).
- 검증에 실제로 쓰인 값(videoId로 재구성한 URL)과 최종적으로 저장되는 값이 다르면, 검증을 통과했다는 사실 자체가 무의미해진다 - 저장 값은 검증된 값에서 파생시켜야 한다([`docs/engineering-principles.md`](../engineering-principles.md) 5번 "파생값은 한 곳에서만 계산한다").

## 결과 및 트레이드오프

- 웹 검색이 실패하는 CHANGE_LINK 요청은 이제 최소 `MEDIUM`(Slack 관리자 검토)까지는 도달하지만, 자동 완결(`HIGH`)은 실제 페이지 접근에 성공했을 때만 가능하다 - 관리자 개입 빈도가 늘어나는 트레이드오프를 받아들였다.
- 앞으로 새로운 AI 판정 조치 타입을 추가하거나 외부 입력을 새로 다루는 로직을 짤 때는, 이 ADR의 1~4번과 같은 질문(AI가 실제로 근거를 확인했는지 구분되는가? 자동 실행 상한이 근거 강도에 비례하는가? 검증 대상과 저장 대상이 같은 값에서 파생되는가?)을 먼저 검토한다 - 자동으로 감지되지 않으므로 코드 리뷰 체크리스트로 남긴다.
