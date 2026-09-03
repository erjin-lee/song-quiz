import { ApiProperty } from '@nestjs/swagger';

export class QuizEditSongItemDto {
  @ApiProperty({ description: '내부 곡 ID' })
  songId: string;

  @ApiProperty({ description: '곡명' })
  songNm: string;

  @ApiProperty({ description: '대표 아티스트명' })
  atstNm: string;

  @ApiProperty({ description: '유튜브 URL(videoId 기반 정규화된 값)' })
  youtubeUrl: string;

  @ApiProperty({ description: '정답 목록', type: [String] })
  answers: string[];

  @ApiProperty({
    description:
      '조회 시점에 서버가 이 링크를 다시 검증해서 통과했으면 발급한 토큰(빌더에서 ' +
      '바로 "확인 완료" 상태로 프리필하는 용도). 실패했으면 null.',
    nullable: true,
  })
  verificationToken: string | null;

  @ApiProperty({
    description: '재검증에 실패한 사유(통과 시 null)',
    nullable: true,
  })
  failReason: string | null;
}

/** 본인 소유 퀴즈 수정 화면 프리필용(GET /quizzes/:quizId) - 소유권 확인 포함. */
export class QuizEditDetailDto {
  @ApiProperty({ description: '퀴즈 ID' })
  quizId: string;

  @ApiProperty({ description: '퀴즈 제목' })
  quizTtl: string;

  @ApiProperty({ description: '퀴즈 설명', nullable: true })
  quizDesc: string | null;

  @ApiProperty({ description: '출제곡 목록', type: [QuizEditSongItemDto] })
  songs: QuizEditSongItemDto[];
}
