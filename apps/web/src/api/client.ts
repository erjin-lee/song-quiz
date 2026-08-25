export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8001';

/** Room REST/Socket.IO 전용 apps/game 서비스 URL. 나머지 REST 호출은 API_BASE_URL을 그대로 쓴다. */
export const GAME_BASE_URL =
  import.meta.env.VITE_GAME_BASE_URL ?? 'http://localhost:8002';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      (Array.isArray(body?.message) ? body.message.join(', ') : body?.message) ??
      `요청에 실패했습니다. (${response.status})`;
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(API_BASE_URL, path, { method: 'GET' });
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(API_BASE_URL, path, {
    method: 'POST',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(API_BASE_URL, path, {
    method: 'PATCH',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** apps/game(Room REST) 전용 요청 헬퍼. 인증 토큰 첨부/에러 처리 방식은 apiGet 등과 동일하다. */
export function gameGet<T>(path: string): Promise<T> {
  return request<T>(GAME_BASE_URL, path, { method: 'GET' });
}

export function gamePost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(GAME_BASE_URL, path, {
    method: 'POST',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export function gamePatch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(GAME_BASE_URL, path, {
    method: 'PATCH',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
