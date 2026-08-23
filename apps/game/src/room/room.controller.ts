import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { AuthClient } from './clients/auth.client';
import { CreateRoomRequestDto } from './dto/create-room-request.dto';
import { GetRoomsQueryDto } from './dto/get-rooms-query.dto';
import { JoinRoomRequestDto } from './dto/join-room-request.dto';
import { LeaveRoomRequestDto } from './dto/leave-room-request.dto';
import { LeaveRoomResultDto } from './dto/leave-room-result.dto';
import { RoomItemDto } from './dto/room-item.dto';
import { RoomJoinResultDto } from './dto/room-join-result.dto';
import { UpdateNicknameRequestDto } from './dto/update-nickname-request.dto';
import { UpdateRoomRequestDto } from './dto/update-room-request.dto';
import { RoomService } from './room.service';

@ApiTags('room')
@Controller('rooms')
export class RoomController {
  constructor(
    private readonly roomService: RoomService,
    private readonly authClient: AuthClient,
  ) {}

  /**
   * Authorization 헤더의 유저 JWT를 검증해 로그인 유저의 계정 userId를 반환한다.
   * 토큰이 없으면 게스트로 취급해 undefined를 반환한다(로그인 없이도 방을 만들고
   * 입장할 수 있어야 한다). 토큰이 있는데 무효하거나 계정이 더 이상 ACTIVE가
   * 아니면 게스트로 조용히 낮추지 않고 401을 던진다. 클라이언트가 임의의 userId를
   * 요청 본문으로 보내 다른 계정을 사칭하는 것을 막기 위해, 방 참가자 ID는 항상
   * 이 방식으로만 서버가 결정한다. 실제 JWT 검증과 계정 상태 조회는 apps/api가
   * 소유하므로 AuthClient(내부 HTTP)로 위임한다.
   */
  private resolveAccountUserId(req: Request): Promise<string | undefined> {
    return this.authClient.resolveOptionalAccountUserId(
      req.headers.authorization,
    );
  }

  @Get()
  @ApiOperation({
    summary:
      '퀴즈 방 목록 조회. page/pageSize를 생략하면 전체 목록을 반환한다.',
  })
  @ApiOkResponse({ description: '방 목록', type: RoomItemDto, isArray: true })
  getRooms(@Query() query: GetRoomsQueryDto): Promise<RoomItemDto[]> {
    return this.roomService.getRooms(query.page, query.pageSize);
  }

  @Get(':roomId')
  @ApiOperation({ summary: '퀴즈 방 단건 조회(새로고침 시 방 상태 복구용)' })
  @ApiParam({ name: 'roomId', description: '방 ID' })
  @ApiOkResponse({ description: '방 정보', type: RoomItemDto })
  @ApiNotFoundResponse({ description: '방을 찾을 수 없음' })
  async getRoom(@Param('roomId') roomId: string): Promise<RoomItemDto> {
    const room = await this.roomService.getRoom(roomId);
    if (!room) {
      throw new NotFoundException(`방을 찾을 수 없습니다. (roomId: ${roomId})`);
    }
    return room;
  }

  @Post()
  @ApiOperation({ summary: '퀴즈 방 생성(생성자는 자동으로 방에 입장)' })
  @ApiOkResponse({ description: '생성된 방 정보', type: RoomJoinResultDto })
  @ApiNotFoundResponse({ description: '퀴즈를 찾을 수 없음' })
  async createRoom(
    @Body() createRoomRequestDto: CreateRoomRequestDto,
    @Req() req: Request,
  ): Promise<RoomJoinResultDto> {
    const accountUserId = await this.resolveAccountUserId(req);
    return this.roomService.createRoom(createRoomRequestDto, accountUserId);
  }

  @Post(':roomId/join')
  @ApiOperation({ summary: '퀴즈 방 입장' })
  @ApiParam({ name: 'roomId', description: '방 ID' })
  @ApiOkResponse({ description: '입장 결과', type: RoomJoinResultDto })
  @ApiNotFoundResponse({ description: '방을 찾을 수 없음' })
  @ApiConflictResponse({ description: '방 정원이 가득 참' })
  async joinRoom(
    @Param('roomId') roomId: string,
    @Body() joinRoomRequestDto: JoinRoomRequestDto,
    @Req() req: Request,
  ): Promise<RoomJoinResultDto> {
    const accountUserId = await this.resolveAccountUserId(req);
    return this.roomService.joinRoom(
      roomId,
      joinRoomRequestDto,
      accountUserId,
      req.ip,
    );
  }

  @Patch(':roomId')
  @ApiOperation({
    summary: '방장이 게임 시작 전/종료 후 방 정보를 수정',
  })
  @ApiParam({ name: 'roomId', description: '방 ID' })
  @ApiOkResponse({ description: '수정된 방 정보', type: RoomItemDto })
  @ApiNotFoundResponse({ description: '방 또는 퀴즈를 찾을 수 없음' })
  @ApiConflictResponse({ description: '게임 진행 중이라 수정할 수 없음' })
  async updateRoom(
    @Param('roomId') roomId: string,
    @Body() updateRoomRequestDto: UpdateRoomRequestDto,
  ): Promise<RoomItemDto> {
    const isValid = this.roomService.verifyMembershipToken(
      roomId,
      updateRoomRequestDto.userId,
      updateRoomRequestDto.accessToken,
    );
    if (!isValid) {
      throw new UnauthorizedException('유효하지 않은 접근입니다.');
    }
    return this.roomService.updateRoom(roomId, updateRoomRequestDto);
  }

  @Post(':roomId/nickname')
  @ApiOperation({
    summary:
      '방 안에서 닉네임 변경(게스트 전용). 로그인 유저는 계정 닉네임을 사용하므로 변경할 수 없다.',
  })
  @ApiParam({ name: 'roomId', description: '방 ID' })
  @ApiOkResponse({ description: '변경된 방 정보', type: RoomItemDto })
  @ApiNotFoundResponse({ description: '방 또는 참가자를 찾을 수 없음' })
  async updateNickname(
    @Param('roomId') roomId: string,
    @Body() updateNicknameRequestDto: UpdateNicknameRequestDto,
    @Req() req: Request,
  ): Promise<RoomItemDto> {
    const accountUserId = await this.resolveAccountUserId(req);
    if (accountUserId) {
      throw new ForbiddenException(
        '로그인 유저는 방 안에서 닉네임을 변경할 수 없습니다.',
      );
    }

    const isValid = this.roomService.verifyMembershipToken(
      roomId,
      updateNicknameRequestDto.userId,
      updateNicknameRequestDto.accessToken,
    );
    if (!isValid) {
      throw new UnauthorizedException('유효하지 않은 접근입니다.');
    }
    return this.roomService.updateNickname(
      roomId,
      updateNicknameRequestDto.userId,
      updateNicknameRequestDto.nickname,
    );
  }

  @Post(':roomId/leave')
  @ApiOperation({ summary: '퀴즈 방 퇴장' })
  @ApiParam({ name: 'roomId', description: '방 ID' })
  @ApiOkResponse({ description: '퇴장 결과', type: LeaveRoomResultDto })
  @ApiNotFoundResponse({ description: '방 또는 참가자를 찾을 수 없음' })
  leaveRoom(
    @Param('roomId') roomId: string,
    @Body() leaveRoomRequestDto: LeaveRoomRequestDto,
  ): Promise<LeaveRoomResultDto> {
    const isValid = this.roomService.verifyMembershipToken(
      roomId,
      leaveRoomRequestDto.userId,
      leaveRoomRequestDto.accessToken,
    );
    if (!isValid) {
      throw new UnauthorizedException('유효하지 않은 접근입니다.');
    }
    return this.roomService.leaveRoom(roomId, leaveRoomRequestDto.userId);
  }
}
