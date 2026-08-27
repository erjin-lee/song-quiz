import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useDocumentMeta } from './useDocumentMeta';

function getMetaContent(name: string): string | null {
  return document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ?? null;
}

describe('useDocumentMeta', () => {
  afterEach(() => {
    document.title = '';
    document
      .querySelectorAll('meta[name="description"], meta[name="robots"]')
      .forEach((el) => el.remove());
  });

  it('document.title을 설정한다', () => {
    renderHook(() => useDocumentMeta({ title: '방 목록 - 노래 퀴즈' }));

    expect(document.title).toBe('방 목록 - 노래 퀴즈');
  });

  it('robots를 지정하지 않으면 기본값(index, follow)을 사용한다', () => {
    renderHook(() => useDocumentMeta({ title: '제목' }));

    expect(getMetaContent('robots')).toBe('index, follow');
  });

  it('description과 robots을 지정하면 해당 meta 태그에 반영한다', () => {
    renderHook(() =>
      useDocumentMeta({
        title: '제목',
        description: '설명입니다',
        robots: 'noindex',
      }),
    );

    expect(getMetaContent('description')).toBe('설명입니다');
    expect(getMetaContent('robots')).toBe('noindex');
  });

  it('옵션이 바뀌면 기존 meta 태그를 재사용해 내용만 갱신한다', () => {
    const { rerender } = renderHook(
      (props: { title: string; description?: string }) =>
        useDocumentMeta(props),
      { initialProps: { title: '첫 제목', description: '첫 설명' } },
    );
    expect(getMetaContent('description')).toBe('첫 설명');

    rerender({ title: '두 번째 제목', description: '두 번째 설명' });

    expect(document.title).toBe('두 번째 제목');
    expect(getMetaContent('description')).toBe('두 번째 설명');
    expect(
      document.querySelectorAll('meta[name="description"]').length,
    ).toBe(1);
  });
});
