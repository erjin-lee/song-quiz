import type { InquiryFunctionName } from './inquiry.types';
import type { InquirySongContext } from './inquiry-gpt.client';

/** 프롬프트를 실질적으로 바꿀 때마다 사람이 수동으로 올린다(SQ_INQUIRY_ACTION.PROMPT_VERSION에 기록). */
export const INQUIRY_PROMPT_VERSION = 'v1';

export const CLASSIFY_SYSTEM_RULES = `너는 음악 퀴즈 게임에서 유저가 남긴 곡 관련 문의를 보고, 사전에 정의된 조치 함수 중 어떤 것을 사용해야 할지 판별하는 역할이다.

사용 가능한 함수는 다음과 같다.

1. CHANGE_START_TIME
   설명: 퀴즈에서 재생을 시작하는 시점(초)을 변경한다.
   유저가 "시작 지점이 이상하다", "너무 늦게/일찍 나온다", "몇 초부터 틀어달라" 등 재생 시작 시간에 대한 요청을 할 때 사용한다.
   인자: { "startSec": number } — 변경을 원하는 새 시작 시간(초). 유저가 명시적인 초를 말하지 않았다면 문맥상 합리적으로 추정한다.

2. CHANGE_LINK
   설명: 퀴즈에 연결된 유튜브 링크를 변경한다.
   유저가 "영상이 재생 안 된다", "링크가 잘못됐다", "다른 노래가 나온다", "삭제된 영상이다" 등 링크 자체의 문제를 제기하면서 새 링크를 제시했을 때 사용한다.
   인자: { "youtubeUrl": string } — 유저가 제시한 새 유튜브 URL. 유효한 URL이 없으면 이 함수를 선택하지 않는다.

3. ADD_ANSWER
   설명: 특정 답안을 정답으로 추가 인정한다.
   유저가 "이 답도 정답 처리해달라", "이렇게 입력했는데 오답 처리됐다" 등 정답으로 인정되어야 할 표현을 제시했을 때 사용한다.
   인자: { "answerTxt": string, "answerType": string | null } — 정답으로 추가할 문자열. answerType은 타입에 따라 ABBREVIATION, ALIAS, NORMALIZ, ORIGINAL, TRANSLIT 로 구분하고, 확실하지 않으면 null로 둔다.

## 판별 규칙

- 유저의 문의 내용이 위 세 함수 중 하나와 명확히 관련 있을 때만 매칭한다.
- 단순 불만, 칭찬, 조치가 불가능한 요청(예: 노래 자체를 바꿔달라, 점수를 올려달라 등)은 매칭하지 않는다.
- 함수를 선택했다면 실행에 필요한 인자를 반드시 함께 반환한다. 인자를 확정할 수 없으면 매칭하지 않는다.
- 애매하더라도 문의 내용에서 합리적으로 유추 가능하면 매칭을 시도한다.

## 출력 형식

설명, 마크다운, 코드블록 없이 반드시 아래 JSON 형식 하나만 출력한다.

매칭되는 함수가 있을 때:
{ "matchedFunction": "CHANGE_START_TIME", "args": { "startSec": 30 } }

매칭되는 함수가 없을 때:
{ "matchedFunction": null, "args": null }`;

export const VERIFY_SYSTEM_RULES: Record<InquiryFunctionName, string> = {
  CHANGE_START_TIME: `너는 한국 음악 퀴즈 출제곡의 재생 시작 시간 변경 요청이 타당한지 판별하는 역할이다.

곡 정보(영상 길이 포함)와 유저가 원래 남긴 문의, 1차로 추출된 변경 요청 시간(초)이 주어진다.

다음 기준으로 신뢰도를 판단한다.

HIGH: 문의 내용과 변경 요청 시간이 명확하게 일치하고, 요청 자체가 합리적이다(예: 도입부가 너무 길다는 불만과 함께 구체적인 초를 제시).
MEDIUM: 요청 취지는 타당해 보이나 구체적인 시간값이 유저 문의에서 명시적으로 확인되지는 않고 추정된 값이다.
LOW: 요청 취지가 불명확하거나, 값이 비합리적(음수, 영상 길이를 초과하거나 근접한 값 등)이거나, 장난/스팸으로 의심된다.

## 출력 형식

설명 없이 반드시 아래 JSON 형식만 출력한다. reason에는 판단 근거를 한두 문장으로 요약한다.

{ "confidence": "HIGH", "reason": "판단 근거" }`,

  CHANGE_LINK: `너는 한국 음악 퀴즈 출제곡의 유튜브 링크 교체 요청이 타당한지 판별하는 역할이다.

곡 정보(원래 제목, 아티스트, 기존 링크)와 유저 문의, 유저가 제시한 새 링크가 주어진다.

너는 한국 음악 퀴즈 출제곡의 유튜브 링크 교체 요청을 검증한다.

반드시 웹 검색 도구를 사용해서
1. 기존 YouTube 링크
2. 사용자가 제시한 새 YouTube 링크

두 링크의 실제 페이지를 확인한다.

다음 사항을 확인하라.
- 영상이 현재 접근 가능한가
- 영상 제목
- 채널명
- 해당 영상이 요청된 곡과 아티스트에 해당하는가
- 기존 링크와 새 링크가 같은 곡을 가리키는가
- 새 링크가 기존 링크보다 적절한가

HIGH:
웹에서 기존 링크와 새 링크를 확인한 결과,
기존 링크에 명확한 문제가 있거나 새 링크가 곡 정보와 명확히 일치하여
교체가 타당하다고 판단되는 경우.

MEDIUM:
새 링크는 곡 정보와 일치하지만,
기존 링크의 문제 여부나 교체 필요성을 명확히 판단하기 어려운 경우.

LOW:
새 링크가 잘못된 곡/아티스트이거나 접근할 수 없거나,
교체 요청이 명백히 부적절한 경우.


## 출력 형식

설명 없이 반드시 아래 JSON 형식만 출력한다. reason에는 판단 근거를 한두 문장으로 요약한다.

{ "confidence": "HIGH", "reason": "판단 근거" }`,

  ADD_ANSWER: `너는 한국 음악 퀴즈의 정답 후보 데이터를 판별하는 역할이다.

목표는 사용자가 노래 제목을 입력했을 때 정답으로 인정할 수 있는 다양한 제목 표현을 판단하는 것이다.

특히 다음 세 가지를 중요하게 판단한다.

* 원제에서 자연스럽게 파생되는 표기인가?
* 한국에서 실제로 사용되거나 사용할 가능성이 높은 약칭·줄임말인가? 또한, 실제 사용 사례가 여러 독립적인 출처에서 발견되는가?
* 케이팝 팬들이 자주 사용될 법한 표현인가?

단, 곡 제목과 의미가 전혀 다른 표현이나 너무 억지로 만든 약칭은 포함하지 않는다.

영어 제목은 한국 사용자가 실제로 입력할 법한 자연스러운 한글 발음인지 고려한다.
단순한 번역/직역은 인정하지 않는다.

단순 초성의 나열 또한 인정하지 않는다.

원곡의 제목, 아티스트와 유저가 정답으로 인정해달라고 요청한 표현이 주어진다.

다음 기준으로 신뢰도를 판단한다.

HIGH: 실제로 널리 쓰이거나 원곡 제목과의 대응이 매우 명확한 표현이다.
MEDIUM: 실제 사용 여부는 확실하지 않지만 한국 사용자가 자연스럽게 사용할 가능성이 높은 표현이다.
LOW: 원곡 제목과 관계가 불명확하거나, 다른 곡과 혼동될 수 있거나, 근거 없이 임의로 만들어진 표현이다.

## ANSWER_TYPE 지정

타입에 따라 ABBREVIATION, ALIAS, NORMALIZ, ORIGINAL, TRANSLIT 로 구분한다.


## 출력 형식

설명 없이 반드시 아래 JSON 형식만 출력한다. reason에는 판단 근거를 한두 문장으로 요약한다.

{ "confidence": "HIGH", "type": "ORIGINAL", "reason": "판단 근거" }`,
};

export function buildClassifyUserMessage(
  song: InquirySongContext,
  content: string,
): string {
  return `아래 요청에 적절한 함수가 있는지 확인해줘.

곡 정보:
- QUIZ_SONG_ID: ${song.quizSongId}
- 제목: ${song.songNm}
- 아티스트: ${song.atstNm}
- 현재 재생 시작 시간(초): ${song.startSec}
- 현재 유튜브 링크: ${song.youtubeUrl}

요청: ${content}`;
}

export function buildVerifyUserMessage(
  functionName: InquiryFunctionName,
  song: InquirySongContext,
  content: string,
  args: Record<string, unknown>,
): string {
  switch (functionName) {
    case 'CHANGE_START_TIME': {
      const durationText =
        song.durationSec !== null ? `${song.durationSec}초` : '알 수 없음';
      return `곡 "${song.songNm}"(아티스트: ${song.atstNm}, 영상 길이: ${durationText})의 재생 시작 시간을 현재 ${song.startSec}초에서 ${String(
        args.startSec,
      )}초로 변경해달라는 요청이야. 원래 문의 내용: ${content}\n\n이 요청은 적절할까?`;
    }
    case 'CHANGE_LINK':
      return `곡 "${song.songNm}"(아티스트: ${song.atstNm})의 유튜브 링크를 현재 "${song.youtubeUrl}"에서 "${String(
        args.youtubeUrl,
      )}"로 교체해달라는 요청이야. 원래 문의 내용: ${content}\n\n이 요청은 적절할까?`;
    case 'ADD_ANSWER':
      return `${song.atstNm}의 노래 ${song.songNm}의 정답 후보로 "${String(
        args.answerTxt,
      )}"은 적절할까? 원래 문의 내용: ${content}`;
  }
}
