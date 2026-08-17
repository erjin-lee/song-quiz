import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class JoinRoomRequestDto {
  @ApiProperty({ description: '닉네임', example: '홍길동' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  nickname: string;

  @ApiProperty({
    description: '비밀방 입장 비밀번호. 비밀방이 아니면 무시된다.',
    example: '1234',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  password?: string;
}
