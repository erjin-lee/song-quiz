import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumberString,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateRoomRequestDto {
  @ApiProperty({ description: '방 제목', example: '아이유 노래 맞추기 방' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  roomTtl: string;

  @ApiProperty({ description: '퀴즈 ID', example: '1' })
  @IsNumberString()
  quizId: string;

  @ApiProperty({ description: '출제곡 랜덤 여부', example: false })
  @IsBoolean()
  isRandom: boolean;

  @ApiProperty({ description: '최대 인원(2~50)', example: 8 })
  @IsInt()
  @Min(2)
  @Max(50)
  maxUserCnt: number;

  @ApiProperty({ description: '방장 닉네임', example: '홍길동' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  nickname: string;
}
