import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { AdminSeedService } from './admin-seed.service';
import { User } from '../user/entities/user.entity';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));

describe('AdminSeedService', () => {
  let service: AdminSeedService;
  const originalEnv = { ...process.env };

  const userRepositoryMock = {
    findOne: jest.fn(),
    create: jest.fn((entity) => entity),
    save: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      ADMIN_USER: 'admin',
      ADMIN_PASSWORD: 'admin1234',
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminSeedService,
        { provide: getRepositoryToken(User), useValue: userRepositoryMock },
      ],
    }).compile();

    service = module.get<AdminSeedService>(AdminSeedService);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('ADMIN_USER 또는 ADMIN_PASSWORD가 없으면 아무것도 하지 않는다', async () => {
    process.env.ADMIN_USER = '';

    await service.onApplicationBootstrap();

    expect(userRepositoryMock.findOne).not.toHaveBeenCalled();
    expect(userRepositoryMock.save).not.toHaveBeenCalled();
  });

  it('동일 loginId의 ADMIN 계정이 이미 있으면 생성하지 않는다', async () => {
    userRepositoryMock.findOne.mockResolvedValue({
      loginId: 'admin',
      role: 'ADMIN',
    });

    await service.onApplicationBootstrap();

    expect(userRepositoryMock.save).not.toHaveBeenCalled();
  });

  it('동일 loginId가 있지만 ADMIN이 아니면 생성/승격하지 않는다', async () => {
    userRepositoryMock.findOne.mockResolvedValue({
      loginId: 'admin',
      role: 'USER',
    });

    await service.onApplicationBootstrap();

    expect(userRepositoryMock.save).not.toHaveBeenCalled();
  });

  it('계정이 없으면 비밀번호를 해싱해 ADMIN 계정을 생성한다', async () => {
    userRepositoryMock.findOne.mockResolvedValue(null);

    await service.onApplicationBootstrap();

    expect(bcrypt.hash).toHaveBeenCalledWith('admin1234', 10);
    expect(userRepositoryMock.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: expect.any(String),
        loginId: 'admin',
        pwdHash: 'hashed-password',
        role: 'ADMIN',
        status: 'ACTIVE',
      }),
    );
  });
});
