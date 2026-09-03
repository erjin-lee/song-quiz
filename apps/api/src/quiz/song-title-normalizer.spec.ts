import {
  stripFeatAnnotations,
  toComparableText,
} from './song-title-normalizer';

describe('stripFeatAnnotations', () => {
  it('Feat. 표기를 제거한다', () => {
    expect(
      stripFeatAnnotations('금요일에 만나요 (Feat. 장이정 Of HISTORY)'),
    ).toBe('금요일에 만나요');
  });

  it('소문자 feat.도 제거한다', () => {
    expect(stripFeatAnnotations('TOO BAD (feat. Anderson .Paak)')).toBe(
      'TOO BAD',
    );
  });

  it('Prod./with 표기도 제거한다', () => {
    expect(stripFeatAnnotations('곡 제목 (Prod. 아무개)')).toBe('곡 제목');
    expect(stripFeatAnnotations('곡 제목 (with 누구)')).toBe('곡 제목');
  });

  it('Feat/Prod/with와 무관한 괄호는 남긴다', () => {
    expect(stripFeatAnnotations('봄날 (Live)')).toBe('봄날 (Live)');
  });

  it('괄호 표기가 없으면 원본을 그대로 반환한다', () => {
    expect(stripFeatAnnotations('봄날')).toBe('봄날');
  });
});

describe('toComparableText', () => {
  it('공백과 특수문자를 제거하고 소문자로 맞춘다', () => {
    expect(toComparableText('TOO BAD - Official MV!')).toBe('toobadofficialmv');
  });

  it('한글은 그대로 남긴다', () => {
    expect(toComparableText('봄날 [최초 공개]')).toBe('봄날최초공개');
  });
});
