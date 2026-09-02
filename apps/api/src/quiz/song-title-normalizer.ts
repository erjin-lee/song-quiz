/**
 * 곡 제목의 Feat/Prod/with 등 괄호 표기를 제거한다. GPT 없이 규칙 기반으로
 * 정답 후보를 만들거나(quiz-answer 생성), 유튜브 영상 제목과 곡 제목을
 * 대조할 때(youtube-link-validation.service.ts) 공통으로 쓴다.
 *
 * 반달괄호/전각괄호 안에 feat/ft/prod/with 토큰이 있는 경우만 제거한다 -
 * "(Live)"처럼 관련 없는 괄호 표기까지 지우면 안 되기 때문이다.
 */
const FEAT_ANNOTATION_PATTERN =
  /[([（][^()[\]（）]*\b(feat|ft|prod|with)\b\.?[^()[\]（）]*[)\]）]/giu;

export function stripFeatAnnotations(title: string): string {
  return title
    .replace(FEAT_ANNOTATION_PATTERN, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * 두 문자열이 "같은 말인지" 러프하게 비교하기 위해 공백·특수문자를 전부 제거하고
 * 소문자로 맞춘다. 언어(한글/영문/숫자)는 그대로 남긴다.
 */
export function toComparableText(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}
