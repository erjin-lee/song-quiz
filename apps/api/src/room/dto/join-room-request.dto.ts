import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class JoinRoomRequestDto {
  @ApiProperty({ description: '닉네임', example: '홍길동' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  nickname: string;

  @ApiProperty({
    description:
      '로그인 유저의 계정 userId. 로그인 상태면 방 참가자 userId로 이 값을 그대로 쓴다(비로그인이면 서버가 임의 생성).',
    example: 'a1b2c3d4-...',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  userId?: string;
}
