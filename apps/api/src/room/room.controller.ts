import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { UserJwtPayload } from '../user/user-auth.types';
import { CreateRoomRequestDto } from './dto/create-room-request.dto';
import { JoinRoomRequestDto } from './dto/join-room-request.dto';
import { LeaveRoomRequestDto } from './dto/leave-room-request.dto';
import { LeaveRoomResultDto } from './dto/leave-room-result.dto';
import { RoomItemDto } from './dto/room-item.dto';
import { RoomJoinResultDto } from './dto/room-join-result.dto';
import { RoomService } from './room.service';

@ApiTags('room')
@Controller('rooms')
export class RoomController {
  constructor(
    private readonly roomService: RoomService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Authorization 헤더의 유저 JWT를 검증해 로그인 유저의 계정 userId를 반환한다.
   * 토큰이 없거나 유효하지 않으면 게스트로 취급해 undefined를 반환한다(에러를
   * 던지지 않음 — 로그인 없이도 방을 만들고 입장할 수 있어야 한다). 클라이언트가
   * 임의의 userId를 요청 본문으로 보내 다른 계정을 사칭하는 것을 막기 위해,
   * 방 참가자 ID는 항상 이 방식으로만 서버가 결정한다.
   */
  private resolveAccountUserId(req: Request): string | undefined {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return undefined;
    }
    try {
      const payload = this.jwtService.verify<UserJwtPayload>(
        authHeader.slice('Bearer '.length),
        { secret: process.env.USER_JWT_SECRET },
      );
      return payload.userId;
    } catch {
      return undefined;
    }
  }

  @Get()
  @ApiOperation({ summary: '퀴즈 방 목록 조회' })
  @ApiOkResponse({ description: '방 목록', type: RoomItemDto, isArray: true })
  getRooms(): Promise<RoomItemDto[]> {
    return this.roomService.getRooms();
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
  createRoom(
    @Body() createRoomRequestDto: CreateRoomRequestDto,
    @Req() req: Request,
  ): Promise<RoomJoinResultDto> {
    return this.roomService.createRoom(
      createRoomRequestDto,
      this.resolveAccountUserId(req),
    );
  }

  @Post(':roomId/join')
  @ApiOperation({ summary: '퀴즈 방 입장' })
  @ApiParam({ name: 'roomId', description: '방 ID' })
  @ApiOkResponse({ description: '입장 결과', type: RoomJoinResultDto })
  @ApiNotFoundResponse({ description: '방을 찾을 수 없음' })
  @ApiConflictResponse({ description: '방 정원이 가득 참' })
  joinRoom(
    @Param('roomId') roomId: string,
    @Body() joinRoomRequestDto: JoinRoomRequestDto,
    @Req() req: Request,
  ): Promise<RoomJoinResultDto> {
    return this.roomService.joinRoom(
      roomId,
      joinRoomRequestDto,
      this.resolveAccountUserId(req),
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
    return this.roomService.leaveRoom(roomId, leaveRoomRequestDto.userId);
  }
}
