import { useState, type FormEvent } from 'react';
import { submitInquiry } from '../api/inquiry';
import { ApiError } from '../api/client';
import { INQUIRY_CONTENT_MAX_LENGTH } from '../types/inquiry';

interface InquiryModalProps {
  quizSongId: string;
  songNm: string;
  atstNm: string;
  roomId: string;
  userId: string;
  onClose: () => void;
  onSubmitted: (message: string) => void;
}

export function InquiryModal({
  quizSongId,
  songNm,
  atstNm,
  roomId,
  userId,
  onClose,
  onSubmitted,
}: InquiryModalProps) {
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || submitting) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await submitInquiry({
        quizSongId,
        roomId,
        userId,
        content: trimmed,
      });
      onSubmitted(result.message);
      onClose();
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError
          ? error.message
          : '문의 접수에 실패했습니다. 잠시 후 다시 시도해주세요.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-bold text-slate-800">문의하기</h2>
        <p className="mb-4 text-sm text-slate-500">
          &quot;{songNm}&quot;({atstNm})
        </p>

        <div className="mb-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
          <p className="mb-1 font-semibold text-slate-600">
            아래와 같은 요청을 처리할 수 있어요.
          </p>
          <ul className="list-disc space-y-0.5 pl-4">
            <li>재생 시작 지점이 이상해요 (예: 몇 초부터 나오게 해주세요)</li>
            <li>영상 링크가 잘못됐어요 (재생 불가, 다른 곡 재생 등)</li>
            <li>이렇게 입력했는데 오답 처리됐어요 (정답 추가 요청)</li>
          </ul>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <textarea
            value={content}
            onChange={(event) =>
              setContent(event.target.value.slice(0, INQUIRY_CONTENT_MAX_LENGTH))
            }
            maxLength={INQUIRY_CONTENT_MAX_LENGTH}
            rows={4}
            placeholder="문의 내용을 입력해주세요."
            className="resize-none rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-purple-300"
          />
          <span className="self-end text-xs text-slate-400">
            {content.length}/{INQUIRY_CONTENT_MAX_LENGTH}
          </span>

          {errorMessage && (
            <p className="text-sm text-rose-500">{errorMessage}</p>
          )}

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-5 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting || !content.trim()}
              className="rounded-full bg-purple-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-purple-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              {submitting ? '접수 중...' : '보내기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
