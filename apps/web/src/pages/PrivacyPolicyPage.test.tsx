import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PrivacyPolicyPage } from './PrivacyPolicyPage';

describe('PrivacyPolicyPage', () => {
  it('document.title을 설정한다', () => {
    render(<PrivacyPolicyPage />);

    expect(document.title).toBe('개인정보처리방침 | 노래맞히기');
  });

  it('개인정보처리방침 제목과 문의 이메일을 보여준다', () => {
    render(<PrivacyPolicyPage />);

    expect(
      screen.getByRole('heading', { name: '개인정보처리방침' }),
    ).toBeInTheDocument();
    expect(screen.getByText('noraemat.site@gmail.com')).toBeInTheDocument();
  });
});
