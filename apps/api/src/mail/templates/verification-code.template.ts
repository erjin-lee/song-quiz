const SITE_NAME = '노래맞히기';
const SITE_URL = 'https://noraemat.site';
const LOGO_URL = 'https://noraemat.site/noraemat_logo.png';

export interface VerificationCodeEmailInput {
  code: string;
  expiresInMinutes?: number;
}

export interface VerificationCodeEmail {
  subject: string;
  html: string;
}

export function buildVerificationCodeEmail({
  code,
  expiresInMinutes = 5,
}: VerificationCodeEmailInput): VerificationCodeEmail {
  return {
    subject: `[${SITE_NAME}] 이메일 인증번호예요`,
    html: `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${SITE_NAME} 이메일 인증</title>
  </head>
  <body
    style="margin: 0; padding: 0; background-color: #f6f0fb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Apple SD Gothic Neo', 'Malgun Gothic', Roboto, Helvetica, Arial, sans-serif;"
  >
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">
      이메일 인증번호를 확인해주세요.
    </div>
    <table
      role="presentation"
      width="100%"
      cellpadding="0"
      cellspacing="0"
      style="background-color: #f6f0fb; padding: 32px 16px;"
    >
      <tr>
        <td align="center">
          <table
            role="presentation"
            width="480"
            cellpadding="0"
            cellspacing="0"
            style="width: 480px; max-width: 100%; background-color: #ffffff; border-radius: 24px; box-shadow: 0 8px 24px rgba(147, 51, 234, 0.08);"
          >
            <tr>
              <td style="padding: 40px 32px 32px; text-align: center;">
                <img
                  src="${LOGO_URL}"
                  alt="${SITE_NAME}"
                  height="36"
                  style="height: 36px; width: auto;"
                />
              </td>
            </tr>
            <tr>
              <td style="padding: 0 32px; text-align: center;">
                <p
                  style="margin: 0 0 8px; font-size: 18px; font-weight: 700; color: #1e293b;"
                >
                  이메일 인증을 완료해주세요
                </p>
                <p
                  style="margin: 0; font-size: 14px; line-height: 1.6; color: #64748b;"
                >
                  아래 인증번호를 입력창에 그대로 입력하면 이메일 인증이
                  완료돼요.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding: 28px 32px 0;">
                <table
                  role="presentation"
                  width="100%"
                  cellpadding="0"
                  cellspacing="0"
                  style="background-color: #faf5ff; border: 1px solid #f3e8ff; border-radius: 16px;"
                >
                  <tr>
                    <td style="padding: 22px 16px; text-align: center;">
                      <span
                        style="font-family: 'SFMono-Regular', Consolas, Menlo, monospace; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #9333ea;"
                        >${code}</span
                      >
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 16px 32px 0; text-align: center;">
                <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                  인증번호는 발급 후 ${expiresInMinutes}분간 유효해요.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding: 24px 32px 0;">
                <hr
                  style="border: none; border-top: 1px solid #f3e8ff; margin: 0;"
                />
              </td>
            </tr>
            <tr>
              <td style="padding: 20px 32px 40px; text-align: center;">
                <p style="margin: 0; font-size: 12px; line-height: 1.6; color: #94a3b8;">
                  본인이 요청하지 않았다면 이 이메일을 무시해주세요.<br />
                  본 메일은 발신 전용이에요.
                </p>
              </td>
            </tr>
          </table>
          <table
            role="presentation"
            width="480"
            cellpadding="0"
            cellspacing="0"
            style="width: 480px; max-width: 100%; margin-top: 20px;"
          >
            <tr>
              <td style="text-align: center;">
                <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                  <a
                    href="${SITE_URL}"
                    style="color: #94a3b8; text-decoration: underline;"
                    >${SITE_NAME}</a
                  >
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  };
}
