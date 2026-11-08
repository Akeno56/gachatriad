'use client';
import { useEffect, useRef, useState } from 'react';
import { CHAT_CHANNELS } from '@gacha-triad/shared/social';
import { useSocial } from './social-state';
import { useSession } from './session';
import { ChatMessageContent } from './chat-message-content';
import { Avatar } from './avatar';
import { api } from '../lib/platform';
import { appPath } from '../lib/connection';
const labels = { general: 'General', trade: 'Trade', lobbies: 'Lobbies' };
export function ChannelChat({ compact = false }: { compact?: boolean }) {
  const { data, error: loadError, channel, setChannel } = useSocial(),
    { profile, refresh, openAccount } = useSession();
  const [drafts, setDrafts] = useState<Record<string, string>>({}),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const message = drafts[channel] ?? '',
    onlinePlayers = data.onlinePlayers ?? [],
    messages = data.chat.filter((m) => (m.channel ?? 'general') === channel);
  const list = useRef<HTMLDivElement>(null),
    sticky = useRef(true),
    pending = useRef<{ text: string; channel: string; id: string } | null>(null);
  useEffect(() => {
    setDrafts({});
    setError('');
    pending.current = null;
  }, [profile?.id]);
  useEffect(() => {
    sticky.current = true;
    setError('');
  }, [channel]);
  useEffect(() => {
    if (sticky.current && list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [messages.at(-1)?.id, channel]);
  return (
    <section
      className={`menu-window main-chat ${compact ? 'chat-compact' : ''}`}
      aria-labelledby="main-chat-title"
    >
      <div className="channel-heading">
        <h2 id="main-chat-title" className="window-label">
          Main chat
        </h2>
        <div className="chat-channel-tabs" role="tablist" aria-label="Public chat channels">
          {CHAT_CHANNELS.map((c) => (
            <button key={c} role="tab" aria-selected={c === channel} onClick={() => setChannel(c)}>
              {labels[c]}
            </button>
          ))}
        </div>
      </div>
      <div className="public-chat-body">
        <div
          className="chat-messages"
          ref={list}
          role="log"
          aria-label={`${labels[channel]} chat messages`}
          aria-live="polite"
          onScroll={() => {
            const el = list.current;
            if (el) sticky.current = el.scrollHeight - el.scrollTop - el.clientHeight < 70;
          }}
        >
          {!messages.length && <p>No messages in {labels[channel]} yet.</p>}
          {messages.map((m) => (
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
        <aside className="chat-user-list" aria-label="Online players">
          <h3>
            Online <span>{onlinePlayers.length}</span>
          </h3>
          <div>
            {onlinePlayers.map((p) => (
              <a key={p.id} href={appPath(`/profile?id=${p.id}`)}>
                <Avatar card={p.avatar} name={p.name} />
                <span>
                  {p.name}
                  {p.id === profile?.id ? ' (you)' : ''}
                  {p.title && <small>{p.title}</small>}
                </span>
              </a>
            ))}
          </div>
        </aside>
      </div>
      <form
        className="chat-compose"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || !message.trim()) return;
          const text = message.trim(),
            target = channel;
          if (pending.current?.text !== text || pending.current?.channel !== target)
            pending.current = { text, channel: target, id: crypto.randomUUID() };
          setBusy(true);
          setError('');
          try {
            await api('/chat', { message: text, requestId: pending.current.id, channel: target });
            setDrafts((current) => ({ ...current, [target]: '' }));
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
          placeholder={`Message ${labels[channel]}…`}
          maxLength={300}
          value={message}
          disabled={!profile?.registered}
          onChange={(e) => setDrafts({ ...drafts, [channel]: e.target.value })}
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
