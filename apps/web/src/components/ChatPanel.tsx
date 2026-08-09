import { useEffect, useRef, useState, type FormEvent } from 'react';

export interface ChatEntry {
  id: string;
  type: 'system' | 'message';
  nickname?: string;
  message: string;
}

interface ChatPanelProps {
  entries: ChatEntry[];
  onSend: (message: string) => void;
}

export function ChatPanel({ entries, onSend }: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [entries]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) {
      return;
    }
    onSend(trimmed);
    setDraft('');
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={scrollRef}
        className="flex max-h-32 flex-col gap-1 overflow-y-auto text-sm"
      >
        {entries.map((entry) =>
          entry.type === 'system' ? (
            <p
              key={entry.id}
              className="rounded-lg bg-emerald-50 px-3 py-1.5 text-emerald-600"
            >
              {entry.message}
            </p>
          ) : (
            <p key={entry.id} className="text-slate-600">
              <span className="font-bold text-slate-800">
                {entry.nickname}
              </span>{' '}
              {entry.message}
            </p>
          ),
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="정답을 입력하세요"
          maxLength={300}
          className="flex-1 rounded-full border border-purple-100 bg-purple-50/60 px-5 py-3 text-sm outline-none placeholder:text-slate-400 focus:border-purple-300"
        />
        <button
          type="submit"
          className="shrink-0 rounded-full bg-purple-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-purple-600"
        >
          보내기
        </button>
      </form>
    </div>
  );
}
