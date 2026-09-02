import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getNotifications, markAllNotificationsRead } from '../api/notification';
import type { NotificationItemDto } from '../types/notification';

const NOTIFICATION_POLL_MS = 30000;

export function NotificationBell() {
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationItemDto[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchNotifications = () => {
      getNotifications()
        .then((result) => {
          setItems(result.items);
          setUnreadCount(result.unreadCount);
        })
        .catch(() => {
          // 알림 조회 실패는 조용히 무시한다(배지가 안 뜨는 정도의 영향).
        });
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, NOTIFICATION_POLL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unreadCount > 0) {
      setItems((prev) => prev.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(0);
      markAllNotificationsRead().catch(() => {
        // 실패해도 다음 폴링에서 다시 시도된다.
      });
    }
  };

  const handleItemClick = (notiId: string) => {
    setOpen(false);
    navigate(`/notifications/${notiId}`);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        aria-label="알림"
        className="relative flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-purple-500"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 rounded-2xl bg-white p-2 shadow-xl">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-slate-400">
              아직 알림이 없어요.
            </p>
          ) : (
            <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
              {items.map((item) => (
                <li key={item.notiId}>
                  <button
                    type="button"
                    onClick={() => handleItemClick(item.notiId)}
                    className="flex w-full flex-col gap-0.5 rounded-xl px-3 py-2 text-left transition hover:bg-slate-50"
                  >
                    <span className="text-sm font-semibold text-slate-700">
                      {item.title}
                    </span>
                    <span className="truncate text-xs text-slate-500">
                      {item.message}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
