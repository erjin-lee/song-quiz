import { withStartSecParam } from 'shared';
import { InquirySongContext } from './inquiry-gpt.client';
import { InquiryFunctionName } from './inquiry.types';
import { SlackMessage } from './slack-notifier.client';

const REQUEST_TYPE_LABELS: Record<InquiryFunctionName, string> = {
  CHANGE_START_TIME: '시작 시간 변경',
  CHANGE_LINK: '유튜브 링크 변경',
  ADD_ANSWER: '정답 추가',
};

export interface BuildInquiryReviewSlackMessageParams {
  inquiryId: string;
  content: string;
  song: InquirySongContext;
  matchedFunction: InquiryFunctionName;
  args: Record<string, unknown>;
}

function formatSec(sec: number): string {
  const total = Math.max(0, Math.round(sec));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Slack mrkdwn 예약 문자(&, <, >)를 이스케이프한다(Slack 공식 권장 순서 - &를 가장 먼저
 * 치환해야 뒤에서 넣는 &lt;/&gt; 안의 &까지 다시 치환되지 않는다). content/곡명/답변
 * 텍스트처럼 사용자가 통제할 수 있는 값을 mrkdwn에 넣기 전에는 반드시 거쳐야 한다 -
 * 그렇지 않으면 <!channel>/<!here>/<@USERID> 같은 Slack 특수 멘션 문법으로 해석되어
 * 검토 채널에 원치 않는 멘션이 발생할 수 있다.
 */
function escapeMrkdwn(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const YOUTUBE_HOSTNAMES = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
]);

/**
 * https 스킴의 유튜브 호스트만 안전한 링크로 취급한다. CHANGE_LINK의 "처리후" URL은
 * 문의 내용에서 GPT가 그대로 추출한 값이라(사용자가 사실상 통제 가능) 검증 없이 클릭
 * 가능한 링크로 노출하면 피싱 링크를 검토자가 클릭하게 만들 수 있다.
 */
function isSafeYoutubeUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' && YOUTUBE_HOSTNAMES.has(url.hostname);
  } catch {
    return false;
  }
}

/** Slack mrkdwn 링크 문법(<url|label>) - label은 mrkdwn 이스케이프 후 |까지 제거해 링크
 *  문법이 깨지지 않게 한다. url은 호출부에서 이미 안전한 값만 넘긴다고 가정한다. */
function slackLink(url: string, label: string): string {
  const escapedLabel = escapeMrkdwn(label).replace(/\|/g, '');
  return `<${url}|${escapedLabel}>`;
}

interface BeforeAfter {
  before: string;
  after: string;
}

/**
 * 문의 타입별로 "처리 전/후" 값이 의미하는 바가 다르다 - CHANGE_START_TIME/CHANGE_LINK는
 * 재생 시작 지점을 미리 들어볼 수 있는 유튜브 링크로, ADD_ANSWER는 텍스트로 보여준다.
 * 여기서 파싱하는 args는 검토용 미리보기일 뿐이라(실제 실행은 승인 시 InquiryService의
 * parseXArgs가 다시 검증한다) 값이 이상해도 던지지 않고 최대한 보여줄 수 있는 형태로 폴백한다.
 */
function buildBeforeAfter(
  matchedFunction: InquiryFunctionName,
  song: InquirySongContext,
  args: Record<string, unknown>,
): BeforeAfter {
  switch (matchedFunction) {
    case 'CHANGE_START_TIME': {
      const beforeSec = song.startSec;
      const requestedSec = Number(args.startSec);
      const afterSec = Number.isFinite(requestedSec) ? requestedSec : beforeSec;
      return {
        before: slackLink(
          withStartSecParam(song.youtubeUrl, beforeSec),
          formatSec(beforeSec),
        ),
        after: slackLink(
          withStartSecParam(song.youtubeUrl, afterSec),
          formatSec(afterSec),
        ),
      };
    }
    case 'CHANGE_LINK': {
      const rawAfterUrl =
        typeof args.youtubeUrl === 'string' ? args.youtubeUrl.trim() : '';
      const afterIsSafe = rawAfterUrl !== '' && isSafeYoutubeUrl(rawAfterUrl);
      return {
        before: slackLink(
          withStartSecParam(song.youtubeUrl, song.startSec),
          song.youtubeUrl,
        ),
        after: afterIsSafe
          ? slackLink(withStartSecParam(rawAfterUrl, song.startSec), rawAfterUrl)
          : rawAfterUrl
            ? `(유효하지 않은 링크) ${escapeMrkdwn(rawAfterUrl)}`
            : '(링크 없음)',
      };
    }
    case 'ADD_ANSWER': {
      const answerTxt =
        typeof args.answerTxt === 'string' ? args.answerTxt.trim() : '';
      const answerType =
        typeof args.answerType === 'string' && args.answerType.trim().length > 0
          ? ` (${escapeMrkdwn(args.answerType.trim())})`
          : '';
      return {
        before: '-',
        after: answerTxt ? `${escapeMrkdwn(answerTxt)}${answerType}` : '-',
      };
    }
  }
}

export function buildInquiryReviewSlackMessage(
  params: BuildInquiryReviewSlackMessageParams,
): SlackMessage {
  const { inquiryId, content, song, matchedFunction, args } = params;
  const { before, after } = buildBeforeAfter(matchedFunction, song, args);
  const headerText = '🔍 문의 검토 필요 (신뢰도: MEDIUM)';
  const songLabel = `${escapeMrkdwn(song.songNm)} - ${escapeMrkdwn(song.atstNm)}`;
  const escapedContent = escapeMrkdwn(content);

  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: headerText, emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*원곡*\n${songLabel}` },
        { type: 'mrkdwn', text: `*문의 유형*\n${REQUEST_TYPE_LABELS[matchedFunction]}` },
      ],
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*문의 내용*\n> ${escapedContent}` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `처리전: ${before}\n\n처리후: ${after}` },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '✅ 승인', emoji: true },
          style: 'primary',
          action_id: 'inquiry_approve',
          // 클릭한 Slack 유저 정보(user.id 등)는 Slack이 인터랙션 요청 자체에 담아 보내주므로
          // 여기 value에는 "무엇에 대한 조치인지"만 담는다 - 실제 인터랙션 엔드포인트는 후속 작업.
          value: JSON.stringify({ inquiryId, action: 'APPROVE' }),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '❌ 반려', emoji: true },
          style: 'danger',
          action_id: 'inquiry_reject',
          value: JSON.stringify({ inquiryId, action: 'REJECT' }),
        },
      ],
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `inquiryId: ${inquiryId}` }],
    },
  ];

  return { text: headerText, blocks };
}
