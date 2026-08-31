import { buildInquiryReviewSlackMessage } from './build-inquiry-review-slack-message';
import { InquirySongContext } from './inquiry-gpt.client';

const baseSong: InquirySongContext = {
  quizSongId: 'qs1',
  songNm: '좋은날',
  atstNm: '아이유',
  startSec: 35,
  youtubeUrl: 'https://www.youtube.com/watch?v=abc123',
  durationSec: 200,
};

function findSectionText(
  blocks: unknown[],
  predicate: (text: string) => boolean,
): string {
  type Block = {
    text?: { text?: string };
    fields?: { text?: string }[];
  };
  for (const block of blocks as Block[]) {
    const candidates = [
      block.text?.text,
      ...(block.fields ?? []).map((field) => field.text),
    ];
    for (const text of candidates) {
      if (typeof text === 'string' && predicate(text)) {
        return text;
      }
    }
  }
  throw new Error('매칭되는 section을 찾지 못했습니다');
}

describe('buildInquiryReviewSlackMessage', () => {
  it('문의 내용의 Slack 특수 멘션 문법을 이스케이프한다', () => {
    const message = buildInquiryReviewSlackMessage({
      inquiryId: 'iq1',
      content: '<!channel> 확인 부탁드립니다',
      song: baseSong,
      matchedFunction: 'ADD_ANSWER',
      args: { answerTxt: '밤양갱' },
    });

    const contentText = findSectionText(message.blocks ?? [], (t) =>
      t.includes('문의 내용'),
    );
    expect(contentText).toContain('&lt;!channel&gt;');
    expect(contentText).not.toContain('<!channel>');
  });

  it('곡명/아티스트명에 포함된 mrkdwn 예약 문자를 이스케이프한다', () => {
    const message = buildInquiryReviewSlackMessage({
      inquiryId: 'iq1',
      content: '문의',
      song: { ...baseSong, songNm: '<A&B>', atstNm: '아티스트' },
      matchedFunction: 'ADD_ANSWER',
      args: { answerTxt: '정답' },
    });

    const songText = findSectionText(message.blocks ?? [], (t) =>
      t.includes('원곡'),
    );
    expect(songText).toContain('&lt;A&amp;B&gt;');
  });

  it('ADD_ANSWER 답변 텍스트를 이스케이프한다', () => {
    const message = buildInquiryReviewSlackMessage({
      inquiryId: 'iq1',
      content: '문의',
      song: baseSong,
      matchedFunction: 'ADD_ANSWER',
      args: { answerTxt: '<@U123> 정답', answerType: '<!here>' },
    });

    const valueText = findSectionText(message.blocks ?? [], (t) =>
      t.startsWith('처리전:'),
    );
    expect(valueText).toContain('&lt;@U123&gt;');
    expect(valueText).toContain('&lt;!here&gt;');
  });

  it('CHANGE_LINK의 처리후 URL이 youtube 호스트가 아니면 링크로 만들지 않는다', () => {
    const message = buildInquiryReviewSlackMessage({
      inquiryId: 'iq1',
      content: '문의',
      song: baseSong,
      matchedFunction: 'CHANGE_LINK',
      args: { youtubeUrl: 'https://evil.example.com/phish' },
    });

    const valueText = findSectionText(message.blocks ?? [], (t) =>
      t.startsWith('처리전:'),
    );
    expect(valueText).toContain('유효하지 않은 링크');
    expect(valueText).not.toMatch(/<https:\/\/evil\.example\.com\/phish\|/);
  });

  it('CHANGE_LINK의 처리후 URL이 정상 youtube 링크면 클릭 가능한 링크로 만든다', () => {
    const message = buildInquiryReviewSlackMessage({
      inquiryId: 'iq1',
      content: '문의',
      song: baseSong,
      matchedFunction: 'CHANGE_LINK',
      args: { youtubeUrl: 'https://youtu.be/def456' },
    });

    const valueText = findSectionText(message.blocks ?? [], (t) =>
      t.startsWith('처리전:'),
    );
    expect(valueText).toMatch(/<https:\/\/youtu\.be\/def456\?t=35\|/);
  });

  it('CHANGE_START_TIME은 시작 시간 링크(t 파라미터)를 만든다', () => {
    const message = buildInquiryReviewSlackMessage({
      inquiryId: 'iq1',
      content: '문의',
      song: baseSong,
      matchedFunction: 'CHANGE_START_TIME',
      args: { startSec: 52 },
    });

    const valueText = findSectionText(message.blocks ?? [], (t) =>
      t.startsWith('처리전:'),
    );
    expect(valueText).toContain('t=35');
    expect(valueText).toContain('t=52');
  });
});
