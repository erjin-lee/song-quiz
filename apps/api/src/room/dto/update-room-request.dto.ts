import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateRoomRequestDto {
  @ApiProperty({
    description: '수정을 요청하는 유저 ID(방장이어야 한다)',
    example: 'b3f1c2e0-1234-4a5b-9c6d-abcdef123456',
  })
  @IsUUID()
  userId: string;

  @ApiProperty({
    description: '입장/생성 시 함께 발급받은 비공개 접근 토큰(본인 확인용)',
    example: 'c4d2e3f1-...',
  })
  @IsString()
  @IsNotEmpty()
  accessToken: string;

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

  @ApiProperty({
    description:
      '출제곡 수. 미지정 시 퀴즈 전체 출제곡 수를 사용한다. 퀴즈 전체 출제곡 수를 초과할 수 없다.',
    example: 10,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  songLimit?: number;

  @ApiProperty({
    description:
      '비공개방 여부. true면 방 목록에 노출되지 않고 링크로만 입장할 수 있다.',
    example: false,
  })
  @IsBoolean()
  isUnlisted: boolean;

  @ApiProperty({
    description: '비밀방 여부. true면 입장 시 password가 일치해야 한다.',
    example: false,
  })
  @IsBoolean()
  isPrivate: boolean;

  @ApiProperty({
    description:
      'isPrivate가 true일 때의 입장 비밀번호. 비밀방을 유지하면서 비밀번호를 바꾸지 않을 때는 비워둔다(기존 비밀번호가 그대로 유지된다).',
    example: '1234',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  password?: string;
}
