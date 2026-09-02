import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import { ApiError } from '../api/client';
import { getNotification } from '../api/notification';
import type { NotificationItemDto } from '../types/notification';

export function NotificationDetailPage() {
  const { notiId } = useParams<{ notiId: string }>();
  const navigate = useNavigate();
  const [notification, setNotification] = useState<NotificationItemDto | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useDocumentMeta({
    title: '알림 | 노래맞히기',
    description: '내 알림 상세 내용을 확인합니다.',
  });

  useEffect(() => {
    if (!notiId) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);

    getNotification(notiId)
      .then((result) => {
        if (!cancelled) {
          setNotification(result);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMessage(
            err instanceof ApiError
              ? err.message
              : '알림을 불러오지 못했습니다.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [notiId]);

  return (
    <div className="min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto flex max-w-lg flex-col gap-6">
        <header className="flex items-center justify-between">
          <Logo size="md" to="/rooms" />
        </header>

        <div className="rounded-3xl bg-white p-6 shadow-lg">
          {loading && (
            <p className="text-sm text-slate-400">불러오는 중...</p>
          )}
          {errorMessage && (
            <p className="text-sm text-rose-500">{errorMessage}</p>
          )}
          {notification && (
            <div className="flex flex-col gap-3">
              <h1 className="text-lg font-bold text-slate-800">
                {notification.title}
              </h1>
              <p className="text-xs text-slate-400">
                {new Date(notification.crtDt).toLocaleString('ko-KR')}
              </p>
              <p className="whitespace-pre-wrap text-sm text-slate-600">
                {notification.message}
              </p>
              {notification.linkPath && (
                <button
                  type="button"
                  onClick={() => navigate(notification.linkPath as string)}
                  className="mt-2 self-start rounded-full bg-purple-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-purple-600"
                >
                  바로가기
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
