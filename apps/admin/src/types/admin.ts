export interface AdminItemDto {
  userId: string;
  loginId: string;
  nickNm: string;
  status: string;
  lastLoginDt: string | null;
  crtDt: string;
}

export interface CreateAdminResponseDto {
  userId: string;
  loginId: string;
  nickNm: string;
  temporaryPassword: string;
}

export interface AdminMeDto {
  userId: string;
  loginId: string;
  nickNm: string;
}
