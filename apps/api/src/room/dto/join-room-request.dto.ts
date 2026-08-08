import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class JoinRoomRequestDto {
  @ApiProperty({ description: '닉네임', example: '홍길동' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  nickname: string;
}
