'use client';
import { useEffect, useRef, useState } from 'react';
import type { MatchView } from '@gacha-triad/shared/platform';
import { LocaleView } from './i18n';
import { ChatMessageContent } from './chat-message-content';
import { useSession } from './session';
import { api } from '../lib/platform';
interface BattleMessage {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
}
export function BattleChat({ match }: { match: MatchView }) {
  const { revision, refresh } = useSession();
  const [messages, setMessages] = useState<BattleMessage[]>([]),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null),
    sticky = useRef(true),
    pending = useRef<{ text: string; id: string } | null>(null);
  useEffect(() => {
    setMessages([]);
    setMessage('');
    pending.current = null;
    sticky.current = true;
  }, [match.id]);
  useEffect(() => {
    let active = true;
    void api<BattleMessage[]>(`/matches/${match.id}/chat`)
      .then((rows) => {
        if (active) setMessages(rows);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [match.id, revision]);
  useEffect(() => {
    if (sticky.current && list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [messages.at(-1)?.id]);
  return (
    <LocaleView>
      <section className="menu-window battle-chat" aria-label="Battle chat">
        <h2 className="window-label">Battle chat</h2>
        <div
          className="chat-messages"
          role="log"
          aria-label="Battle chat messages"
          aria-live="polite"
          ref={list}
          onScroll={() => {
            const el = list.current;
            if (el) sticky.current = el.scrollHeight - el.scrollTop - el.clientHeight < 70;
          }}
        >
          {!messages.length && <p>Only you and your opponent can read this chat.</p>}
          {messages.map((m) => (
            <article className="chat-message" key={m.id}>
              <ChatMessageContent
                person={match.players.find((p) => p.id === m.senderId) ?? match.players[0]}
                body={m.body}
                createdAt={m.createdAt}
              />
            </article>
          ))}
        </div>
        <form
          className="chat-compose"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy || !message.trim()) return;
            const text = message.trim();
            if (pending.current?.text !== text) pending.current = { text, id: crypto.randomUUID() };
            setBusy(true);
            setError('');
            try {
              await api(`/matches/${match.id}/chat`, {
                message: text,
                requestId: pending.current.id,
              });
              setMessage('');
              pending.current = null;
              sticky.current = true;
              await refresh();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="sr-only" htmlFor="battle-chat-message">
            Message your opponent
          </label>
          <input
            id="battle-chat-message"
            value={message}
            maxLength={300}
            autoComplete="off"
            placeholder="Message your opponent…"
            onChange={(e) => setMessage(e.target.value)}
          />
          <button className="primary-button" disabled={busy || !message.trim()}>
            Send
          </button>
        </form>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
      </section>
    </LocaleView>
  );
}
