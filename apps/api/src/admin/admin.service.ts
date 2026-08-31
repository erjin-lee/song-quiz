import { randomUUID } from 'crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { In, Repository } from 'typeorm';
import { QuizSong } from '../quiz/entities/quiz-song.entity';
import { User } from '../user/entities/user.entity';
import { AdminInquiryListDto } from './dto/admin-inquiry-list.dto';
import { AdminItemDto } from './dto/admin-item.dto';
import { AdminLoginRequestDto } from './dto/admin-login-request.dto';
import { AdminLoginResponseDto } from './dto/admin-login-response.dto';
import { AdminMeDto } from './dto/admin-me.dto';
import { ChangeAdminPasswordRequestDto } from './dto/change-admin-password-request.dto';
import { CreateAdminRequestDto } from './dto/create-admin-request.dto';
import { CreateAdminResponseDto } from './dto/create-admin-response.dto';
import { GetAdminInquiriesQueryDto } from './dto/get-admin-inquiries-query.dto';
import { UpdateAdminProfileRequestDto } from './dto/update-admin-profile-request.dto';
import { InquiryAction } from '../inquiry/entities/inquiry-action.entity';
import { Inquiry } from '../inquiry/entities/inquiry.entity';
import { InquiryService } from '../inquiry/inquiry.service';
import { AdminJwtPayload } from './admin-auth.types';
import {
  ADMIN_JWT_EXPIRES_IN,
  ADMIN_ROLE,
  BCRYPT_SALT_ROUNDS,
} from './admin.constants';
import { generateTemporaryPassword } from './temporary-password.util';

function isDuplicateLoginIdError(error: unknown): boolean {
  return (error as { code?: string })?.code === 'ER_DUP_ENTRY';
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Inquiry)
    private readonly inquiryRepository: Repository<Inquiry>,
    @InjectRepository(InquiryAction)
    private readonly inquiryActionRepository: Repository<InquiryAction>,
    @InjectRepository(QuizSong)
    private readonly quizSongRepository: Repository<QuizSong>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly inquiryService: InquiryService,
    private readonly jwtService: JwtService,
  ) {}

  async getInquiries(
    query: GetAdminInquiriesQueryDto,
  ): Promise<AdminInquiryListDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    // confidence/matchedFunction 필터는 이제 SQ_INQUIRY가 아니라 SQ_INQUIRY_ACTION 쪽
    // 컬럼이라, 먼저 조건에 맞는 inquiryId를 액션 테이블에서 추려낸 뒤 Inquiry 조회의
    // where 조건으로 좁힌다. 필터가 없으면 이 단계 자체를 건너뛴다.
    let inquiryIdFilter: string[] | undefined;
    if (query.confidence?.length || query.matchedFunction?.length) {
      const matchingActions = await this.inquiryActionRepository.find({
        where: {
          ...(query.confidence?.length && { confidence: In(query.confidence) }),
          ...(query.matchedFunction?.length && {
            actionType: In(query.matchedFunction),
          }),
        },
      });
      inquiryIdFilter = [
        ...new Set(matchingActions.map((action) => action.inquiryId)),
      ];
      if (inquiryIdFilter.length === 0) {
        return { items: [], total: 0, page, pageSize };
      }
    }

    const [inquiries, total] = await this.inquiryRepository.findAndCount({
      where: {
        ...(query.status?.length && { status: In(query.status) }),
        ...(inquiryIdFilter && { inquiryId: In(inquiryIdFilter) }),
      },
      order: { crtDt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const quizSongIds = [...new Set(inquiries.map((i) => i.quizSongId))];
    const quizSongs = quizSongIds.length
      ? await this.quizSongRepository.find({
          where: { quizSongId: In(quizSongIds) },
          relations: { song: { songArtists: { artist: true } } },
        })
      : [];
    const quizSongById = new Map(quizSongs.map((qs) => [qs.quizSongId, qs]));

    const inquiryIds = inquiries.map((i) => i.inquiryId);
    const actions = inquiryIds.length
      ? await this.inquiryActionRepository.find({
          where: { inquiryId: In(inquiryIds) },
          order: { actionSeq: 'DESC' },
        })
      : [];
    // 문의당 액션이 여러 건이어도(재분류 등, 지금은 발생하지 않음) actionSeq 내림차순으로
    // 조회했으니 먼저 만난 것이 최신 액션이다.
    const latestActionByInquiryId = new Map<string, InquiryAction>();
    for (const action of actions) {
      if (!latestActionByInquiryId.has(action.inquiryId)) {
        latestActionByInquiryId.set(action.inquiryId, action);
      }
    }

    const items = inquiries.map((inquiry) => {
      const quizSong = quizSongById.get(inquiry.quizSongId);
      const action = latestActionByInquiryId.get(inquiry.inquiryId);
      return {
        inquiryId: inquiry.inquiryId,
        quizSongId: inquiry.quizSongId,
        songNm: quizSong?.song.songNm ?? null,
        atstNm:
          quizSong?.song.songArtists.find((sa) => sa.mainYn === 'Y')?.artist
            .atstNm ?? null,
        youtubeUrl: quizSong?.youtubeUrl ?? null,
        roomId: inquiry.roomId,
        userId: inquiry.userId,
        content: inquiry.content,
        matchedFunction: action?.actionType ?? null,
        matchedArgs: action?.actionArgs ?? null,
        confidence: action?.confidence ?? null,
        status: inquiry.status,
        resultMessage: inquiry.resultMessage,
        crtDt: inquiry.crtDt,
      };
    });

    return { items, total, page, pageSize };
  }

  approveInquiry(inquiryId: string, adminUserKey: string): Promise<void> {
    return this.inquiryService.approve(inquiryId, { userKey: adminUserKey });
  }

  rejectInquiry(inquiryId: string, adminUserKey: string): Promise<void> {
    return this.inquiryService.reject(inquiryId, { userKey: adminUserKey });
  }

  async createAdmin(
    dto: CreateAdminRequestDto,
  ): Promise<CreateAdminResponseDto> {
    const existing = await this.userRepository.findOne({
      where: { loginId: dto.loginId },
    });
    if (existing) {
      throw new ConflictException('이미 사용 중인 로그인 아이디입니다.');
    }

    const temporaryPassword = generateTemporaryPassword();
    const pwdHash = await bcrypt.hash(temporaryPassword, BCRYPT_SALT_ROUNDS);
    const now = new Date();

    let saved: User;
    try {
      saved = await this.userRepository.save(
        this.userRepository.create({
          userId: randomUUID(),
          loginId: dto.loginId,
          nickNm: dto.nickNm,
          pwdHash,
          role: ADMIN_ROLE,
          status: 'ACTIVE',
          grade: 'NORMAL',
          emailAuthYn: 'N',
          crtDt: now,
          updDt: now,
        }),
      );
    } catch (error) {
      if (isDuplicateLoginIdError(error)) {
        throw new ConflictException('이미 사용 중인 로그인 아이디입니다.');
      }
      throw error;
    }

    return {
      userId: saved.userKey,
      loginId: saved.loginId,
      nickNm: saved.nickNm,
      temporaryPassword,
    };
  }

  async listAdmins(): Promise<AdminItemDto[]> {
    const admins = await this.userRepository.find({
      where: { role: ADMIN_ROLE },
      order: { crtDt: 'DESC' },
    });
    return admins.map((admin) => ({
      userId: admin.userKey,
      loginId: admin.loginId,
      nickNm: admin.nickNm,
      status: admin.status,
      lastLoginDt: admin.lastLoginDt,
      crtDt: admin.crtDt,
    }));
  }

  async login(dto: AdminLoginRequestDto): Promise<AdminLoginResponseDto> {
    const admin = await this.userRepository.findOne({
      where: { loginId: dto.loginId, role: ADMIN_ROLE },
    });
    if (
      !admin ||
      admin.status !== 'ACTIVE' ||
      !(await bcrypt.compare(dto.password, admin.pwdHash))
    ) {
      throw new UnauthorizedException(
        '아이디 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    const payload: AdminJwtPayload = {
      sub: admin.userKey,
      userId: admin.userKey,
      loginId: admin.loginId,
      nickNm: admin.nickNm,
      role: 'ADMIN',
    };
    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.ADMIN_JWT_SECRET,
      expiresIn: ADMIN_JWT_EXPIRES_IN,
    });

    await this.userRepository.update(admin.userKey, {
      lastLoginDt: new Date(),
    });
    return { accessToken, loginId: admin.loginId, nickNm: admin.nickNm };
  }

  async getMe(userId: string): Promise<AdminMeDto> {
    const admin = await this.findAdminByUserIdOrThrow(userId);
    return {
      userId: admin.userKey,
      loginId: admin.loginId,
      nickNm: admin.nickNm,
    };
  }

  async updateMyProfile(
    userId: string,
    dto: UpdateAdminProfileRequestDto,
  ): Promise<AdminMeDto> {
    const admin = await this.findAdminByUserIdOrThrow(userId);
    await this.userRepository.update(admin.userKey, { nickNm: dto.nickNm });
    return {
      userId: admin.userKey,
      loginId: admin.loginId,
      nickNm: dto.nickNm,
    };
  }

  async changeMyPassword(
    userId: string,
    dto: ChangeAdminPasswordRequestDto,
  ): Promise<void> {
    const admin = await this.findAdminByUserIdOrThrow(userId);
    if (!(await bcrypt.compare(dto.currentPassword, admin.pwdHash))) {
      throw new UnauthorizedException('현재 비밀번호가 올바르지 않습니다.');
    }
    const pwdHash = await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS);
    await this.userRepository.update(admin.userKey, { pwdHash });
  }

  private async findAdminByUserIdOrThrow(userId: string): Promise<User> {
    const admin = await this.userRepository.findOne({
      where: { userKey: userId, role: ADMIN_ROLE },
    });
    if (!admin) {
      throw new NotFoundException('관리자 계정을 찾을 수 없습니다.');
    }
    return admin;
  }
}
