import { Injectable } from '@nestjs/common';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class MailService {
  // SES_ACCESS_KEY/SES_SECRET_KEY가 둘 다 있을 때만 명시적 자격증명을 넘긴다.
  // credentials를 아예 생략해야 AWS SDK 기본 provider chain(EC2 instance role,
  // ECS task role 등)이 동작한다 - 빈 문자열이라도 credentials를 넘기면 SDK가
  // 그 값을 그대로 쓰려다 인증 오류를 낸다(IAM Role 기반 인증을 덮어써 버림).
  private readonly client = new SESClient({
    region: process.env.SES_REGION,
    ...(process.env.SES_ACCESS_KEY && process.env.SES_SECRET_KEY
      ? {
          credentials: {
            accessKeyId: process.env.SES_ACCESS_KEY,
            secretAccessKey: process.env.SES_SECRET_KEY,
          },
        }
      : {}),
  });

  async send({ to, subject, html }: SendMailInput): Promise<void> {
    const fromAddress = process.env.MAIL_FROM_ADDRESS;
    if (!fromAddress) {
      throw new Error('MAIL_FROM_ADDRESS 환경 변수가 설정되지 않았습니다.');
    }

    await this.client.send(
      new SendEmailCommand({
        Source: fromAddress,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: { Html: { Data: html, Charset: 'UTF-8' } },
        },
      }),
    );
  }
}
