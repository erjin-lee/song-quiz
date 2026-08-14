import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ChangeAdminPasswordRequestDto {
  @ApiProperty({ description: '현재 비밀번호' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  currentPassword: string;

  @ApiProperty({ description: '새 비밀번호' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(255)
  newPassword: string;
}
