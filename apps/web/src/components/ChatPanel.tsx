import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

export interface ChatEntry {
  id: string;
  type: 'system' | 'message';
  nickname?: string;
  message: string;
}

export interface ChatPanelHandle {
  focus: () => void;
  clearDraft: () => void;
}

interface ChatPanelProps {
  entries: ChatEntry[];
  onSend: (message: string) => void;
  /**
   * 다음 라운드 단축키(Shift+→)가 활성화된 상태인지. 활성화 중에는 입력창이
   * 포커스되어 있어도 해당 키 입력(텍스트 선택 확장)이 반영되지 않도록 막는다.
   */
  blockNextRoundShortcutKey?: boolean;
}

export const ChatPanel = forwardRef<ChatPanelHandle, ChatPanelProps>(
  function ChatPanel({ entries, onSend, blockNextRoundShortcutKey }, ref) {
    const [draft, setDraft] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
      clearDraft: () => setDraft(''),
    }));

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

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
      if (
        blockNextRoundShortcutKey &&
        event.shiftKey &&
        event.code === 'ArrowRight'
      ) {
        event.preventDefault();
      }
    };

    return (
      <div className="flex flex-col gap-3">
        <div
          ref={scrollRef}
          className="flex h-40 min-h-[6rem] max-h-[24rem] flex-col gap-1 overflow-y-auto rounded-xl border border-slate-100 p-2 text-sm resize-y"
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
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
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
  },
);
