'use client';
import { LocaleView, NoTranslate } from './i18n';

import { useEffect, useId, useRef, useState } from 'react';
import { Tabs } from './ui';
import { CHAT_CHANNELS } from '@gacha-triad/shared/social';
import { useSocial } from './social-state';
import { useSession } from './session';
import { ChatMessageContent } from './chat-message-content';
import { Avatar } from './avatar';
import { api } from '../lib/platform';
import { appPath } from '../lib/connection';
const labels = { general: 'General', trade: 'Trade', lobbies: 'Lobbies' };
export function ChannelChat({
  compact = false,
  fitViewport = false,
}: {
  compact?: boolean;
  fitViewport?: boolean;
}) {
  const { data, error: loadError, channel, setChannel } = useSocial(),
    { profile, refresh, openAccount } = useSession();
  const panelId = useId();
  const [drafts, setDrafts] = useState<Record<string, string>>({}),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const message = drafts[channel] ?? '',
    onlinePlayers = data.onlinePlayers ?? [],
    messages = data.chat.filter((m) => (m.channel ?? 'general') === channel);
  const root = useRef<HTMLElement>(null),
    list = useRef<HTMLDivElement>(null),
    sticky = useRef(true),
    pending = useRef<{ text: string; channel: string; id: string } | null>(null);
  useEffect(() => {
    const element = root.current;
    if (!fitViewport || !element) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Use the document position so scrolling the page cannot grow the chat.
        const top = element.getBoundingClientRect().top + window.scrollY;
        const height = Math.max(
          180,
          Math.floor((window.visualViewport?.height ?? innerHeight) - top - 76),
        );
        element.style.setProperty('--home-chat-space', `${height}px`);
      });
    };
    const observer = new ResizeObserver(measure);
    for (const target of [
      element.closest('.play-page'),
      element.parentElement,
      document.querySelector('.system-bar'),
    ]) {
      if (target) observer.observe(target);
    }
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
      element.style.removeProperty('--home-chat-space');
    };
  }, [fitViewport]);
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
    <LocaleView>
      <section
        ref={root}
        className={`menu-window main-chat ${compact ? 'chat-compact' : ''} ${fitViewport ? 'chat-fits-viewport' : ''}`}
        aria-labelledby="main-chat-title"
      >
        <div className="channel-heading">
          <h2 id="main-chat-title" className="window-label">
            Main chat
          </h2>
          <Tabs
            className="chat-channel-tabs"
            label="Public chat channels"
            panelId={panelId}
            items={CHAT_CHANNELS.map((value) => ({ value, label: labels[value] }))}
            value={channel}
            onChange={(value) => setChannel(value as typeof channel)}
          />
        </div>
        <div
          className="public-chat-body"
          id={panelId}
          role="tabpanel"
          aria-label={`${labels[channel]} chat messages`}
        >
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
                  <Avatar card={p.avatar} frameId={p.frameId} name={p.name} />
                  <span>
                    <NoTranslate>{p.name}</NoTranslate>
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
            placeholder={
              profile?.registered ? `Message ${labels[channel]}…` : 'Register or sign in to chat'
            }
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
              Sign in to chat
            </button>{' '}
            to send messages.
          </p>
        )}
        <p className="error-message" role="alert">
          {error || loadError}
        </p>
      </section>
    </LocaleView>
  );
}
