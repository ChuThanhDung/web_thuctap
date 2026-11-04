import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, MessageSquare, Send, X } from 'lucide-react';
import { askAssistant } from '../api.js';
import { batchDetail } from '../routes.js';
import { cn, focusRing } from '../ui/index.js';

// Trợ lý hỏi đáp: hỏi về dữ liệu của công ty bằng lời. Trợ lý chỉ đọc (không duyệt, không sửa gì) và chỉ thấy
// những bộ người hỏi được xem. Mỗi câu hỏi tốn một vài lượt trợ lý của gói.

const SUGGESTIONS = [
  'Bộ nào đang chờ duyệt lâu nhất?',
  'Tháng này nhà cung cấp nào lệch nhiều nhất?',
  'Còn bao nhiêu lượt AI trong tháng?',
];

/** Thay mã bộ trong câu trả lời bằng link mở bộ đó. */
function AnswerText({ text, batches, onNavigate }) {
  if (!batches?.length) return text;
  const pattern = new RegExp(`(${batches.map((b) => b.batch_number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  return text.split(pattern).map((part, index) => {
    const batch = batches.find((b) => b.batch_number === part);
    return batch ? (
      <Link key={index} to={batchDetail(batch.id)} onClick={onNavigate} className="font-semibold text-primary underline underline-offset-2">
        {part}
      </Link>
    ) : (
      <React.Fragment key={index}>{part}</React.Fragment>
    );
  });
}

export default function AssistantPanel({ token }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages, loading]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const ask = async (question) => {
    const text = question.trim();
    if (!text || loading) return;
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setError('');
    setLoading(true);
    try {
      const reply = await askAssistant(
        token,
        next.map(({ role, content }) => ({ role, content: content.slice(0, 1000) })),
      );
      setMessages([...next, { role: 'assistant', content: reply.answer, batches: reply.batches }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="assistant-panel"
        className={cn(
          'fixed bottom-5 right-5 z-40 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-fg shadow-card hover:bg-primary-hover',
          focusRing,
          open && 'hidden sm:inline-flex',
        )}
      >
        <MessageSquare size={17} aria-hidden="true" />
        Hỏi trợ lý
      </button>

      {open && (
        <section
          id="assistant-panel"
          role="dialog"
          aria-label="Trợ lý hỏi đáp"
          className="fixed inset-x-0 bottom-0 z-50 flex h-[80vh] flex-col border-t border-line bg-surface shadow-card sm:inset-x-auto sm:bottom-20 sm:right-5 sm:h-[560px] sm:w-[400px] sm:rounded-card sm:border"
        >
          <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-fg">Trợ lý hỏi đáp</h2>
              <p className="text-xs text-fg-muted">Chỉ đọc dữ liệu bạn được xem; không duyệt hay sửa gì.</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Đóng trợ lý"
              className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-fg-subtle hover:text-fg', focusRing)}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm" aria-live="polite">
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-fg-muted">Hỏi về bộ chứng từ, nhà cung cấp, hàng chờ duyệt hay mức dùng. Ví dụ:</p>
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => ask(suggestion)}
                    className={cn(
                      'block w-full rounded-control border border-line px-3 py-2 text-left text-fg hover:border-primary',
                      focusRing,
                    )}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            {messages.map((message, index) => (
              <div key={index} className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}>
                <p
                  className={cn(
                    'max-w-[85%] whitespace-pre-wrap rounded-card px-3 py-2',
                    message.role === 'user' ? 'bg-primary text-primary-fg' : 'bg-surface-muted text-fg',
                  )}
                >
                  {message.role === 'assistant' ? (
                    <AnswerText text={message.content} batches={message.batches} onNavigate={() => setOpen(false)} />
                  ) : (
                    message.content
                  )}
                </p>
              </div>
            ))}
            {loading && (
              <p role="status" className="flex items-center gap-2 text-fg-muted">
                <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Đang tra dữ liệu…
              </p>
            )}
            {error && (
              <p role="alert" className="text-tone-danger-fg">
                {error}
              </p>
            )}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              ask(input);
            }}
            className="flex items-center gap-2 border-t border-line px-3 py-3"
          >
            <label htmlFor="assistant-input" className="sr-only">
              Câu hỏi cho trợ lý
            </label>
            <input
              id="assistant-input"
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              maxLength={1000}
              placeholder="Hỏi trợ lý…"
              className={cn(
                'h-10 min-w-0 flex-1 rounded-control border border-line-input bg-surface px-3 text-sm text-fg placeholder:text-fg-muted',
                focusRing,
              )}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Gửi câu hỏi"
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-primary text-primary-fg hover:bg-primary-hover disabled:opacity-50',
                focusRing,
              )}
            >
              <Send size={16} aria-hidden="true" />
            </button>
          </form>
        </section>
      )}
    </>
  );
}
