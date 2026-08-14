import { apiGet, apiPatch, apiPost } from '@/lib/api-client';
import type { AdminItemDto, AdminMeDto, CreateAdminResponseDto } from '@/types/admin';

export function getAdmins(): Promise<AdminItemDto[]> {
  return apiGet<AdminItemDto[]>('/admin/admins');
}

export function createAdmin(
  loginId: string,
  nickNm: string,
): Promise<CreateAdminResponseDto> {
  return apiPost<CreateAdminResponseDto>('/admin/admins', { loginId, nickNm });
}

export function getMe(): Promise<AdminMeDto> {
  return apiGet<AdminMeDto>('/admin/me');
}

export function updateMyProfile(nickNm: string): Promise<AdminMeDto> {
  return apiPatch<AdminMeDto>('/admin/me', { nickNm });
}

export function changeMyPassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  return apiPatch<void>('/admin/me/password', { currentPassword, newPassword });
}
