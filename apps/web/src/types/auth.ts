export interface LoginResponseDto {
  accessToken: string;
  userId: string;
  loginId: string;
  nickNm: string;
}

export interface MeDto {
  userId: string;
  loginId: string;
  nickNm: string;
}
