import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { useSession } from '../context/SessionContext';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import { ApiError } from '../api/client';
import { getNotifications } from '../api/notification';
import { deleteQuiz, getMyQuizzes } from '../api/quiz-registration';
import type { NotificationItemDto } from '../types/notification';
import type { MyQuizListItemDto } from '../types/quiz-registration';

type Tab = 'quizzes' | 'notifications';

export function MyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isInitialized } = useSession();

  useDocumentMeta({ title: '마이페이지 | 노래맞히기' });

  const [tab, setTab] = useState<Tab>('quizzes');
  const [infoMessage, setInfoMessage] = useState<string | null>(
    (location.state as { message?: string } | null)?.message ?? null,
  );

  const [quizzes, setQuizzes] = useState<MyQuizListItemDto[]>([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(true);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MyQuizListItemDto | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const [notifications, setNotifications] = useState<NotificationItemDto[]>(
    [],
  );
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  useEffect(() => {
    if (isInitialized && !isAuthenticated) {
      navigate('/rooms');
    }
  }, [isInitialized, isAuthenticated, navigate]);

  const loadQuizzes = () => {
    setLoadingQuizzes(true);
    setQuizError(null);
    getMyQuizzes()
      .then(setQuizzes)
      .catch((err) => {
        setQuizError(
          err instanceof ApiError
            ? err.message
            : '퀴즈 목록을 불러오지 못했습니다.',
        );
      })
      .finally(() => setLoadingQuizzes(false));
  };

  useEffect(() => {
    if (!isInitialized || !isAuthenticated) {
      return;
    }
    loadQuizzes();
  }, [isInitialized, isAuthenticated]);

  useEffect(() => {
    if (tab !== 'notifications' || !isAuthenticated) {
      return;
    }
    setLoadingNotifications(true);
    getNotifications()
      .then((result) => setNotifications(result.items))
      .catch(() => setNotifications([]))
      .finally(() => setLoadingNotifications(false));
  }, [tab, isAuthenticated]);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || deleting) {
      return;
    }
    setDeleting(true);
    try {
      await deleteQuiz(deleteTarget.quizId);
      setQuizzes((prev) =>
        prev.filter((quiz) => quiz.quizId !== deleteTarget.quizId),
      );
      setDeleteTarget(null);
    } catch (err) {
      setQuizError(
        err instanceof ApiError ? err.message : '퀴즈 삭제에 실패했습니다.',
      );
    } finally {
      setDeleting(false);
    }
  };

  if (!isInitialized || (isInitialized && !isAuthenticated)) {
    return null;
  }

  return (
    <div className="min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header className="flex items-center justify-between">
          <Logo size="md" to="/rooms" />
        </header>

        {infoMessage && (
          <div className="rounded-2xl bg-purple-50 px-4 py-3 text-sm text-purple-700">
            {infoMessage}
            <button
              type="button"
              onClick={() => setInfoMessage(null)}
              className="ml-2 text-purple-400 hover:text-purple-600"
            >
              닫기
            </button>
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab('quizzes')}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              tab === 'quizzes'
                ? 'bg-purple-500 text-white'
                : 'bg-white text-slate-500 hover:bg-slate-100'
            }`}
          >
            내가 등록한 퀴즈
          </button>
          <button
            type="button"
            onClick={() => setTab('notifications')}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              tab === 'notifications'
                ? 'bg-purple-500 text-white'
                : 'bg-white text-slate-500 hover:bg-slate-100'
            }`}
          >
            알림
          </button>
        </div>

        {tab === 'quizzes' && (
          <div className="flex flex-col gap-3">
            {loadingQuizzes && (
              <p className="text-sm text-slate-400">불러오는 중...</p>
            )}
            {quizError && <p className="text-sm text-rose-500">{quizError}</p>}

            {!loadingQuizzes && quizzes.length === 0 && !quizError && (
              <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/60 px-5 py-12 text-center">
                <span className="text-3xl">🎼</span>
                <p className="text-sm font-semibold text-slate-500">
                  아직 등록한 퀴즈가 없어요
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/quizzes/new')}
                  className="mt-1 rounded-full bg-purple-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-purple-600"
                >
                  + 퀴즈 만들기
                </button>
              </div>
            )}

            {quizzes.map((quiz) => (
              <div
                key={quiz.quizId}
                className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-800">
                    {quiz.quizTtl}
                  </p>
                  <p className="text-xs text-slate-400">
                    {quiz.songCount}곡 · 플레이 {quiz.playCnt}회
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/quizzes/${quiz.quizId}/edit`)}
                  className="shrink-0 rounded-full bg-slate-100 px-4 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                >
                  수정
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(quiz)}
                  className="shrink-0 rounded-full bg-rose-50 px-4 py-1.5 text-xs font-semibold text-rose-500 hover:bg-rose-100"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === 'notifications' && (
          <div className="flex flex-col gap-2">
            {loadingNotifications && (
              <p className="text-sm text-slate-400">불러오는 중...</p>
            )}
            {!loadingNotifications && notifications.length === 0 && (
              <p className="rounded-2xl bg-white/60 px-5 py-10 text-center text-sm text-slate-400">
                아직 알림이 없어요.
              </p>
            )}
            {notifications.map((item) => (
              <button
                key={item.notiId}
                type="button"
                onClick={() => navigate(`/notifications/${item.notiId}`)}
                className="flex flex-col gap-0.5 rounded-2xl bg-white p-4 text-left shadow-sm transition hover:bg-slate-50"
              >
                <span className="text-sm font-semibold text-slate-700">
                  {item.title}
                </span>
                <span className="truncate text-xs text-slate-500">
                  {item.message}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-xs rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-base font-bold text-slate-800">
              정말 삭제할까요?
            </h2>
            <p className="mb-4 text-sm text-slate-500">
              삭제한 퀴즈는 목록에서 사라져요.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-full px-5 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className="rounded-full bg-rose-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:bg-slate-200"
              >
                {deleting ? '삭제 중...' : '삭제하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
