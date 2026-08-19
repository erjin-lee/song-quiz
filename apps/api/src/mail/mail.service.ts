import { Injectable } from '@nestjs/common';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class MailService {
  private readonly client = new SESClient({
    region: process.env.SES_REGION,
    credentials: {
      accessKeyId: process.env.SES_ACCESS_KEY ?? '',
      secretAccessKey: process.env.SES_SECRET_KEY ?? '',
    },
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
