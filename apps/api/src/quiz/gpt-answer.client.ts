import { Injectable, Logger } from '@nestjs/common';

const GPT_API_URL = 'https://api.openai.com/v1/chat/completions';
const GPT_MODEL = 'gpt-5.6-luna';
const MAX_FETCH_ATTEMPTS = 3;
const FETCH_RETRY_DELAY_MS = 800;
const MAX_ANSWER_LENGTH = 300;
const MAX_ANSWER_TYPE_LENGTH = 12;
const MAX_CONFIDENCE_LENGTH = 8;

export class GptFetchError extends Error {}

export interface GptSongInput {
  quizSongId: string;
  songNm: string;
  atstNm: string;
}

export interface GptAnswerCandidate {
  answerTxt: string;
  answerType: string | null;
  confidence: string | null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
const SYSTEM_RULES = `너는 한국 음악 퀴즈의 정답 후보 데이터를 생성하는 역할이다.

입력으로 각 곡의 \`QUIZ_SONG_ID\`, \`TITLE\`, \`ARTIST\`가 주어진다.

목표는 사용자가 노래 제목을 입력했을 때 정답으로 인정할 수 있는 다양한 제목 표현을 생성하는 것이다.

특히 다음 두 가지를 중요하게 처리한다.

* 원제에서 자연스럽게 파생되는 표기 변형을 빠짐없이 생성한다.
* 한국에서 실제로 사용되거나 사용할 가능성이 높은 약칭·줄임말을 포함한다.

단, 곡 제목과 의미가 전혀 다른 표현이나 너무 억지로 만든 약칭은 포함하지 않는다.

## 생성 규칙

각 곡마다 아래 항목을 순서대로 검토한다.

### 1. 원래 제목

입력받은 \`TITLE\`을 그대로 반드시 포함한다.

### 2. 부가정보를 제거한 순수 제목

괄호 안에 곡 제목 자체가 아닌 부가정보가 있으면 제거한 제목을 추가한다.

제거 가능한 예:

* Feat.
* Featuring
* Ft.
* With
* Prod.
* Produced by
* Acoustic Ver.
* Live Ver.
* Remix
* Remaster
* Remastered
* Solo
* OST 관련 부가설명
* 프로젝트명 또는 음원 출처 설명

예:

\`금요일에 만나요 (Feat. 장이정 Of HISTORY)\`
→ \`금요일에 만나요\`

\`TOO BAD (feat. Anderson .Paak)\`
→ \`TOO BAD\`

\`UP (KARINA Solo)\`
→ \`UP\`

단, 괄호 안 내용이 제목 자체의 일부라면 임의로 제거하지 않는다.


### 3. 의미 없는 특수문자 제거

쉼표, 마침표, 일부 기호 등 제목의 의미를 바꾸지 않는 특수문자를 제거한 형태를 추가한다.

필요하면 특수문자 제거 후:

* 공백을 유지한 형태
* 공백까지 제거한 형태

둘 다 생성한다.

예:

\`봄, 사랑, 벚꽃 말고\`
→ \`봄 사랑 벚꽃 말고\`
→ \`봄사랑벚꽃말고\`

\`APT.\`
→ \`APT\`

단, 특수문자 자체가 제목의 중요한 의미를 가지는 경우에는 원제를 반드시 유지한다.

### 4. 영어 제목의 한글 발음

영어 제목은 한국 사용자가 실제로 입력할 법한 자연스러운 한글 발음을 포함한다.

한글 발음은 다음 두 형태를 우선 고려한다.

* 단어 사이 공백을 유지한 형태
* 공백을 제거한 형태

예:

\`strawberry moon\`
→ \`스트로베리 문\`
→ \`스트로베리문\`

\`Hype Boy\`
→ \`하입 보이\`
→ \`하입보이\`

\`Whiplash\`
→ \`위플래시\`

\`Supernova\`
→ \`슈퍼노바\`

영어를 기계적으로 철자 하나씩 읽은 표현보다 한국에서 일반적으로 사용하는 발음을 우선한다.
또 한 여러 방면으로 불리는 경우 모두 추가한다.

\`Love Wins All\`
→ \`러브 윈즈 올\`
→ \`러브윈스올\`


## 5. 약칭·줄임말

약칭 생성은 매우 중요한 작업이다.

각 곡마다 반드시 별도로 약칭 존재 가능성을 검토한다.

특히 다음 제목은 약칭 가능성을 적극적으로 확인한다.

* 한국어 기준 3어절 이상
* 영어 기준 3단어 이상
* 제목이 길어서 일상 대화에서 그대로 부르기 불편한 곡
* 팬덤이나 커뮤니티에서 자주 언급될 가능성이 높은 곡
* 이미 잘 알려진 히트곡

### 약칭으로 인정할 수 있는 유형

다음과 같은 형태를 검토한다.

#### A. 주요 어절의 첫 음절 조합

예:

\`비도 오고 그래서\`
→ \`비오그\`

\`봄, 사랑, 벚꽃 말고\`
→ \`봄사벚\`

\`금요일에 만나요\`
→ \`금만나\`


#### B. 긴 제목의 핵심 부분을 조합한 약칭

예:

\`어떻게 이별까지 사랑하겠어, 널 사랑하는 거지\`
→ \`어이널사\`

\`한 페이지가 될 수 있게\`
→ \`한페될\`

\`주저하는 연인들을 위해\`
→ \`주저연\`

#### C. 제목의 앞부분이 사실상 곡명처럼 사용되는 경우

예:

\`첫 만남은 계획대로 되지 않아\`
→ \`첫만남\`


#### D. 영어 제목에서 한국에서 자연스럽게 만들어진 약칭

예:

\`strawberry moon\`
→ \`스베문\`

이런 형태가 자연스럽게 사용되는 경우에만 포함한다.

### 약칭 판단 기준

약칭은 공식 명칭이어야 할 필요는 없다.

다음 중 하나 이상에 해당하면 포함할 수 있다.

* 한국 음악 팬이나 일반 이용자가 실제로 사용할 법하다.
* SNS, 커뮤니티, 메신저 등에서 자연스럽게 사용할 수 있다.
* 해당 약칭을 보고 원곡을 비교적 쉽게 연상할 수 있다.
* 한국에서 흔히 사용하는 노래 제목 줄임 방식과 일치한다.
* 유명한 약칭 패턴과 유사하다.

다만 다음 표현은 한번 더 고려하고 추가한다.

* 단순히 모든 단어의 첫 글자를 기계적으로 조합한 것
* 발음하기 어려운 조합
* 해당 표현만으로 원곡을 떠올리기 어려운 것
* 실제 사용 가능성이 매우 낮은 것
* 다른 유명 곡이나 일반 단어와 쉽게 혼동되는 것

### 약칭 판단 방향

약칭 여부가 조금 애매하다는 이유만으로 무조건 제외하지 않는다.

다음 기준으로 판단한다.

\`자연스럽게 사용될 가능성이 높음\`
→ 포함

\`실제 사용 가능성이 있으나 다소 애매함\`
→ 제목이 길고 줄임 필요성이 크다면 포함 가능

\`모델이 알고있는 약칭\`
→ 포함


약칭 후보를 생성할 때 애매하다는 이유만으로 제외하지 않는다.

각 곡에 대해 자연스럽게 생각할 수 있는 약칭 후보를 가능한 범위에서
적극적으로 생성한다.

대신 각 후보마다 confidence를 부여한다.

HIGH:
- 실제 널리 사용되는 것으로 알고 있는 약칭
- 또는 제목과의 대응이 매우 명확한 표현

MEDIUM:
- 실제 사용 여부는 확실하지 않지만
  한국 사용자가 자연스럽게 사용할 가능성이 높은 표현

LOW:
- 실제 사용 여부가 불명확하고
  제목으로부터 추론하여 만든 표현이지만
  정답 후보로 검토할 가치가 있는 표현

애매한 후보도 삭제하지 말고 LOW로 반환한다.

단, 제목과 관계없는 표현이나 원곡을 유추하기 매우 어려운
무작위 조합은 생성하지 않는다.


## 6. 중복 제거

한 곡 안에서 동일한 \`ANSWER_TXT\`는 절대 중복하지 않는다.

출력 직전에 반드시 중복을 제거한다.

특히 다음 경우를 확인한다.

* 동일 문자열 중복
* 원제와 가공 결과가 동일해진 경우
* 괄호 제거 후 기존 후보와 동일해진 경우

대소문자 차이만 있는 표현은 특별히 정답 가치가 있지 않다면 하나만 남겨도 된다.

## 7. QUIZ_SONG_ID

\`quizSongId\`는 입력받은 \`QUIZ_SONG_ID\` 값을 그대로 문자열로 사용한다.


## 8. ANSWER_TYPE 지정

타입에 따라 ABBREVIATION, ALIAS, NORMALIZ, ORIGINAL, TRANSLIT 로 구분한다.


절대로:

* 새 ID를 만들지 않는다.
* 숫자를 증가시키지 않는다.
* 순서를 변경하지 않는다.
* 다른 곡의 ID와 바꾸지 않는다.

## 내부 검토 절차

각 곡마다 결과를 출력하기 전에 내부적으로 아래 질문을 반드시 확인한다.

1. 원제가 들어갔는가?
2. 괄호 안 부가정보를 제거할 수 있는가?
3. 공백 제거 버전을 만들 수 있는가?
4. 의미 없는 특수문자 제거 버전이 필요한가?
5. 영어라면 자연스러운 한글 발음이 있는가?
6. 이 곡을 한국 사람들이 짧게 부를 때 사용할 만한 약칭이 있는가?
7. 제목이 길다면 실제 대화에서 어떻게 줄여 부를 가능성이 높은가?
8. 억지로 만들어낸 약칭은 없는가?
9. 아티스트명이나 제목 외 정보가 섞이지 않았는가?
10. answers 안에 중복이 없는가?

## 입력 형식

입력은 다음과 같이 탭으로 구분되어 주어진다.

\`QUIZ_SONG_ID\tTITLE\tARTIST\`

## 출력 형식

설명, 마크다운, 코드블록을 절대 출력하지 않는다.

반드시 유효한 JSON 하나만 출력한다.

형식:

{
    "results": [
        {
            "quizSongId": "574",
            "answers": [
                {
                    "answerTxt": "너에게 닿기를",
                    "type": "ORIGINAL",
                    "confidence": "HIGH"
                },
                {
                    "answerTxt": "너에게닿기를",
                    "type": "NORMALIZ",
                    "confidence": "HIGH"
                },
                {
                    "answerTxt": "너닿",
                    "type": "ABBREVIATION",
                    "confidence": "MEDIUM"
                },
                {
                    "answerTxt": "너닿기",
                    "type": "ABBREVIATION",
                    "confidence": "LOW"
                },
                {
                    "answerTxt": "너에게닿",
                    "type": "ABBREVIATION",
                    "confidence": "LOW"
                }
            ]
        },
        {...}
    ]
}

모든 입력 곡을 빠짐없이 처리한다.
입력 순서를 그대로 유지한다.
`;

function buildBatchPrompt(songs: GptSongInput[]): string {
  const songLines = songs
    .map((song) => `${song.quizSongId}\t${song.songNm}\t${song.atstNm}`)
    .join('\n');

  return (
    `다음 곡들의 정답 후보를 생성해줘.\n\n` +
    '아래는 QUIZ_SONG_ID, TITLE, 아티스트명이 탭으로 구분된 곡 목록이다.\n\n' +
    `${songLines}\n\n`
  );
}

function parseAnswerCandidate(raw: unknown): GptAnswerCandidate | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const answerTxt = (raw as { answerTxt?: unknown }).answerTxt;
  if (typeof answerTxt !== 'string') {
    return null;
  }
  const trimmedTxt = answerTxt.trim();
  if (trimmedTxt.length === 0 || trimmedTxt.length > MAX_ANSWER_LENGTH) {
    return null;
  }

  const type = (raw as { type?: unknown }).type;
  const confidence = (raw as { confidence?: unknown }).confidence;

  return {
    answerTxt: trimmedTxt,
    answerType:
      typeof type === 'string' && type.trim().length > 0
        ? type.trim().slice(0, MAX_ANSWER_TYPE_LENGTH)
        : null,
    confidence:
      typeof confidence === 'string' && confidence.trim().length > 0
        ? confidence.trim().slice(0, MAX_CONFIDENCE_LENGTH)
        : null,
  };
}

function parseBatchAnswers(
  content: string,
  requestedIds: Set<string>,
): Map<string, GptAnswerCandidate[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new GptFetchError(`GPT 응답이 JSON 형식이 아닙니다: ${content}`);
  }

  const results =
    parsed &&
    typeof parsed === 'object' &&
    Array.isArray((parsed as { results?: unknown }).results)
      ? (parsed as { results: unknown[] }).results
      : null;
  if (!results) {
    throw new GptFetchError(`GPT 응답에 results 배열이 없습니다: ${content}`);
  }

  const answersByQuizSongId = new Map<string, GptAnswerCandidate[]>();
  for (const item of results) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const quizSongId = (item as { quizSongId?: unknown }).quizSongId;
    const rawAnswers = (item as { answers?: unknown }).answers;
    if (
      typeof quizSongId !== 'string' ||
      !requestedIds.has(quizSongId) ||
      !Array.isArray(rawAnswers)
    ) {
      continue;
    }

    const seenTxt = new Set<string>();
    const candidates: GptAnswerCandidate[] = [];
    for (const rawAnswer of rawAnswers) {
      const candidate = parseAnswerCandidate(rawAnswer);
      if (!candidate || seenTxt.has(candidate.answerTxt)) {
        continue;
      }
      seenTxt.add(candidate.answerTxt);
      candidates.push(candidate);
    }

    if (candidates.length > 0) {
      answersByQuizSongId.set(quizSongId, candidates);
    }
  }

  return answersByQuizSongId;
}

@Injectable()
export class GptAnswerClient {
  private readonly logger = new Logger(GptAnswerClient.name);

  async generateAnswersBatch(
    songs: GptSongInput[],
  ): Promise<Map<string, GptAnswerCandidate[]>> {
    if (songs.length === 0) {
      return new Map();
    }

    const apiKey = process.env.GPT_SECRET_KEY;
    if (!apiKey) {
      throw new GptFetchError('GPT_SECRET_KEY 환경변수가 설정되지 않았습니다.');
    }

    const requestedIds = new Set(songs.map((song) => song.quizSongId));
    const body = JSON.stringify({
      model: GPT_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_RULES },
        { role: 'user', content: buildBatchPrompt(songs) },
      ],
      response_format: { type: 'json_object' },
    });

    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
      try {
        const response = await fetch(GPT_API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body,
        });
        if (!response.ok) {
          throw new GptFetchError(
            `GPT API 응답이 올바르지 않습니다. (status: ${response.status})`,
          );
        }

        const data = (await response.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
          throw new GptFetchError('GPT 응답에 content가 없습니다.');
        }

        return parseBatchAnswers(content, requestedIds);
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `GPT 배치 요청 실패(시도 ${attempt}/${MAX_FETCH_ATTEMPTS}, ${songs.length}곡)`,
        );
        if (attempt < MAX_FETCH_ATTEMPTS) {
          await delay(FETCH_RETRY_DELAY_MS * attempt);
        }
      }
    }

    this.logger.error(`GPT 배치 요청 최종 실패(${songs.length}곡)`, lastError);
    throw lastError instanceof Error
      ? lastError
      : new GptFetchError(`GPT 요청에 실패했습니다. (${songs.length}곡)`);
  }
}
