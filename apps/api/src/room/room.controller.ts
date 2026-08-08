import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
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
  constructor(private readonly roomService: RoomService) {}

  @Get()
  @ApiOperation({ summary: '퀴즈 방 목록 조회' })
  @ApiOkResponse({ description: '방 목록', type: RoomItemDto, isArray: true })
  getRooms(): Promise<RoomItemDto[]> {
    return this.roomService.getRooms();
  }

  @Post()
  @ApiOperation({ summary: '퀴즈 방 생성(생성자는 자동으로 방에 입장)' })
  @ApiOkResponse({ description: '생성된 방 정보', type: RoomJoinResultDto })
  @ApiNotFoundResponse({ description: '퀴즈를 찾을 수 없음' })
  createRoom(
    @Body() createRoomRequestDto: CreateRoomRequestDto,
  ): Promise<RoomJoinResultDto> {
    return this.roomService.createRoom(createRoomRequestDto);
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
  ): Promise<RoomJoinResultDto> {
    return this.roomService.joinRoom(roomId, joinRoomRequestDto);
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
