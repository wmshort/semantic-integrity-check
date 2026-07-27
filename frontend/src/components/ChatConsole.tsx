import { useEffect, useRef, useState } from 'react';
import { Send, Loader2, Trash2, User, Bot } from 'lucide-react';
import type { ChatMessage } from '../lib/types';

interface Props {
  messages: ChatMessage[];
  sending: boolean;
  assistantTurns: number;
  usedFallback: boolean;
  onSend: (text: string) => void;
  onClear: () => void;
}

function roleMeta(role: ChatMessage['role']) {
  switch (role) {
    case 'user':
      return { label: 'You', align: 'items-end', bubble: 'bg-emerald-500/15 text-gray-100', icon: User };
    case 'assistant':
      return { label: 'Model', align: 'items-start', bubble: 'bg-surface text-gray-200', icon: Bot };
    case 'system':
      return { label: 'System', align: 'items-center', bubble: 'bg-surface-border/40 text-gray-400', icon: null };
    default:
      return { label: 'Turn', align: 'items-start', bubble: 'bg-surface text-gray-300', icon: null };
  }
}

// Live, multi-turn chat with the target model. Importing or pasting an existing
// conversation is handled by the Import / Paste methods, not here.
export function ChatConsole(props: Props) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [props.messages, props.sending]);

  const send = () => {
    const text = input.trim();
    if (!text || props.sending) return;
    props.onSend(text);
    setInput('');
  };

  return (
    <div className="rounded-lg border border-surface-border bg-surface/50">
      {/* Toolbar — only once the conversation has started */}
      {props.messages.length > 0 && (
        <div className="flex items-center justify-between border-b border-surface-border px-3 py-2">
          <span className="text-[11px] text-gray-500">
            {props.usedFallback
              ? 'Auditing every turn'
              : `Auditing ${props.assistantTurns} assistant turn${
                  props.assistantTurns === 1 ? '' : 's'
                }`}
          </span>
          <button
            onClick={props.onClear}
            className="flex items-center gap-1 rounded border border-surface-border px-1.5 py-1 text-[11px] text-gray-400 hover:border-red-500/50 hover:text-red-300"
            title="Clear conversation"
          >
            <Trash2 size={12} /> Clear
          </button>
        </div>
      )}

      {/* Message list */}
      <div className="flex max-h-72 flex-col gap-3 overflow-y-auto p-3">
        {props.messages.length === 0 && !props.sending && (
          <p className="py-6 text-center text-xs text-gray-500">
            Send a message to start a conversation with the model. Its replies are
            audited together.
          </p>
        )}
        {props.messages.map((m) => {
          const meta = roleMeta(m.role);
          const Icon = meta.icon;
          return (
            <div key={m.id} className={'flex flex-col ' + meta.align}>
              <span className="mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-gray-600">
                {Icon && <Icon size={10} />} {meta.label}
              </span>
              <div
                className={
                  'max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm leading-relaxed ' +
                  meta.bubble
                }
              >
                {m.content}
              </div>
            </div>
          );
        })}
        {props.sending && (
          <div className="flex flex-col items-start">
            <span className="mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-gray-600">
              <Bot size={10} /> Model
            </span>
            <div className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm text-gray-500">
              <Loader2 size={13} className="animate-spin" /> thinking…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="flex items-end gap-2 border-t border-surface-border p-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          aria-label="Message the model"
          className="h-11 max-h-32 min-h-[2.75rem] flex-1 resize-none rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-gray-200 outline-none focus:border-emerald-500/60"
        />
        <button
          onClick={send}
          disabled={props.sending || input.trim().length === 0}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Send message"
        >
          {props.sending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Send size={16} />
          )}
        </button>
      </div>
    </div>
  );
}
