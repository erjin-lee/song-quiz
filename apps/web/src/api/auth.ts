import { apiGet, apiPost } from './client';
import type { LoginResponseDto, MeDto } from '../types/auth';

export function signup(
  loginId: string,
  password: string,
  nickNm: string,
): Promise<LoginResponseDto> {
  return apiPost<LoginResponseDto>('/auth/signup', { loginId, password, nickNm });
}

export function login(
  loginId: string,
  password: string,
): Promise<LoginResponseDto> {
  return apiPost<LoginResponseDto>('/auth/login', { loginId, password });
}

export function getMe(): Promise<MeDto> {
  return apiGet<MeDto>('/auth/me');
}
