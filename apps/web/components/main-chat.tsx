'use client';
import { useEffect, useRef, useState } from 'react';
import { useSocial } from './social-state';
import { useSession } from './session';
import { ChatMessageContent } from './chat-message-content';
import { api } from '../lib/platform';
export function MainChat() {
  const { data, error: loadError } = useSocial();
  const { profile, refresh, openAccount } = useSession();
  const [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null),
    sticky = useRef(true),
    pending = useRef<{ text: string; id: string } | null>(null);
  useEffect(() => {
    setMessage('');
    setError('');
    pending.current = null;
  }, [profile?.id]);
  useEffect(() => {
    if (sticky.current && list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [data.chat.at(-1)?.id]);
  return (
    <section className="menu-window main-chat" aria-labelledby="main-chat-title">
      <h2 id="main-chat-title" className="window-label">
        Main chat
      </h2>
      <div
        className="chat-messages"
        ref={list}
        role="log"
        aria-label="Main chat messages"
        aria-live="polite"
        onScroll={() => {
          const el = list.current;
          if (el) sticky.current = el.scrollHeight - el.scrollTop - el.clientHeight < 70;
        }}
      >
        {!data.chat.length && <p>No messages yet.</p>}
        {data.chat.map((m) => (
          <article key={m.id} className="chat-message">
            <ChatMessageContent
              person={{ ...m, id: m.playerId }}
              createdAt={m.createdAt}
              body={m.body}
            />
            {profile?.isAdmin && (
              <button
                className="text-button"
                disabled={busy}
                aria-label={`Remove message from ${m.name}`}
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    await api(`/chat/${m.id}`, undefined, 'DELETE');
                    await refresh();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Remove
              </button>
            )}
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
            await api('/chat', { message: text, requestId: pending.current.id });
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
        <label className="sr-only" htmlFor="main-chat-message">
          Main chat message
        </label>
        <input
          id="main-chat-message"
          placeholder="Message the card hall…"
          maxLength={300}
          value={message}
          disabled={!profile?.registered}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button
          className="primary-button"
          disabled={busy || !profile?.registered || !message.trim()}
        >
          Send
        </button>
      </form>
      {!profile?.registered && (
        <p className="chat-registration">
          <button className="text-button" onClick={openAccount}>
            Register or sign in
          </button>{' '}
          to send messages.
        </p>
      )}
      <p className="error-message" role="alert">
        {error || loadError}
      </p>
    </section>
  );
}
