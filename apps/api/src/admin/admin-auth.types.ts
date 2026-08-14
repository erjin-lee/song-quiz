export interface AdminJwtPayload {
  sub: string;
  userId: string;
  loginId: string;
  nickNm: string;
  role: 'ADMIN';
}
