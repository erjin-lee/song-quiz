import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
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

  @ApiProperty({
    description:
      '스피드 모드 여부. 켜면 한 명이라도 정답을 맞히면 6초 뒤 자동으로 정답을 공개하고, 공개 4초 뒤 자동으로 다음 라운드로 진행한다.',
    example: false,
  })
  @IsBoolean()
  speedModeEnabled: boolean;

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
