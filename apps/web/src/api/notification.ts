import { apiGet, apiPatch } from './client';
import type { NotificationItemDto, NotificationListDto } from '../types/notification';

export function getNotifications(): Promise<NotificationListDto> {
  return apiGet<NotificationListDto>('/notifications');
}

export function getNotification(notiId: string): Promise<NotificationItemDto> {
  return apiGet<NotificationItemDto>(`/notifications/${notiId}`);
}

export function markAllNotificationsRead(): Promise<void> {
  return apiPatch<void>('/notifications/read');
}
