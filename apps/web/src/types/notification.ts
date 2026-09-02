export interface NotificationItemDto {
  notiId: string;
  notiType: string;
  title: string;
  message: string;
  linkPath: string | null;
  isRead: boolean;
  crtDt: string;
}

export interface NotificationListDto {
  items: NotificationItemDto[];
  unreadCount: number;
}
