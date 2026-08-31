import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminService } from '../admin/admin.service';
import { UserSlack } from '../user/entities/user-slack.entity';
import { postToSlackResponseUrl } from './post-to-slack-response-url';
import { SlackInteractionService } from './slack-interaction.service';

jest.mock('./post-to-slack-response-url', () => ({
  postToSlackResponseUrl: jest.fn(),
}));

describe('SlackInteractionService', () => {
  let service: SlackInteractionService;

  const userSlackRepositoryMock = {
    findOne: jest.fn(),
  };
  const adminServiceMock = {
    approveInquiry: jest.fn(),
    rejectInquiry: jest.fn(),
  };

  const basePayload = {
    type: 'block_actions',
    team: { id: 'T1' },
    user: { id: 'U1' },
    response_url: 'https://hooks.slack.com/actions/response-url',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    userSlackRepositoryMock.findOne.mockResolvedValue({
      userSlackId: '1',
      userKey: 'admin-key-1',
      slackTeamId: 'T1',
      slackUserId: 'U1',
      isActive: 'Y',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlackInteractionService,
        {
          provide: getRepositoryToken(UserSlack),
          useValue: userSlackRepositoryMock,
        },
        { provide: AdminService, useValue: adminServiceMock },
      ],
    }).compile();

    service = module.get<SlackInteractionService>(SlackInteractionService);
  });

  it('block_actions가 아닌 타입은 무시한다', async () => {
    await service.handle(
      JSON.stringify({ ...basePayload, type: 'view_submission' }),
    );

    expect(userSlackRepositoryMock.findOne).not.toHaveBeenCalled();
  });

  it('payload가 JSON이 아니어도 예외를 던지지 않는다', async () => {
    await expect(service.handle('not json')).resolves.toBeUndefined();
  });

  it('payload 형식이 올바르지 않으면(actions 없음) 조용히 무시한다', async () => {
    await service.handle(JSON.stringify({ ...basePayload, actions: [] }));

    expect(userSlackRepositoryMock.findOne).not.toHaveBeenCalled();
  });

  it('등록되지 않은 Slack 계정이면 승인/반려를 실행하지 않고 에페메럴 메시지만 보낸다', async () => {
    userSlackRepositoryMock.findOne.mockResolvedValue(null);

    await service.handle(
      JSON.stringify({
        ...basePayload,
        actions: [
          {
            action_id: 'inquiry_approve',
            value: JSON.stringify({ inquiryId: 'iq1', action: 'APPROVE' }),
          },
        ],
      }),
    );

    expect(adminServiceMock.approveInquiry).not.toHaveBeenCalled();
    expect(postToSlackResponseUrl).toHaveBeenCalledWith(
      basePayload.response_url,
      expect.objectContaining({ response_type: 'ephemeral' }),
    );
  });

  it('APPROVE 버튼 클릭 시 SQ_USER_SLACK으로 해석한 userKey로 AdminService.approveInquiry를 호출한다', async () => {
    await service.handle(
      JSON.stringify({
        ...basePayload,
        actions: [
          {
            action_id: 'inquiry_approve',
            value: JSON.stringify({ inquiryId: 'iq1', action: 'APPROVE' }),
          },
        ],
      }),
    );

    expect(userSlackRepositoryMock.findOne).toHaveBeenCalledWith({
      where: { slackTeamId: 'T1', slackUserId: 'U1', isActive: 'Y' },
    });
    expect(adminServiceMock.approveInquiry).toHaveBeenCalledWith(
      'iq1',
      'admin-key-1',
    );
    expect(postToSlackResponseUrl).toHaveBeenCalledWith(
      basePayload.response_url,
      expect.objectContaining({ text: expect.stringContaining('승인') }),
    );
  });

  it('REJECT 버튼 클릭 시 AdminService.rejectInquiry를 호출한다', async () => {
    await service.handle(
      JSON.stringify({
        ...basePayload,
        actions: [
          {
            action_id: 'inquiry_reject',
            value: JSON.stringify({ inquiryId: 'iq1', action: 'REJECT' }),
          },
        ],
      }),
    );

    expect(adminServiceMock.rejectInquiry).toHaveBeenCalledWith(
      'iq1',
      'admin-key-1',
    );
    expect(postToSlackResponseUrl).toHaveBeenCalledWith(
      basePayload.response_url,
      expect.objectContaining({ text: expect.stringContaining('반려') }),
    );
  });

  it('AdminService 호출이 실패하면(이미 처리됨 등) 에페메럴로 실패 사유를 회신한다', async () => {
    adminServiceMock.approveInquiry.mockRejectedValue(
      new Error('검토 대기 상태의 문의만 처리할 수 있습니다.'),
    );

    await service.handle(
      JSON.stringify({
        ...basePayload,
        actions: [
          {
            action_id: 'inquiry_approve',
            value: JSON.stringify({ inquiryId: 'iq1', action: 'APPROVE' }),
          },
        ],
      }),
    );

    expect(postToSlackResponseUrl).toHaveBeenCalledWith(
      basePayload.response_url,
      expect.objectContaining({
        response_type: 'ephemeral',
        text: expect.stringContaining(
          '검토 대기 상태의 문의만 처리할 수 있습니다.',
        ),
      }),
    );
  });
});
