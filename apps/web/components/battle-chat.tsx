'use client';
import { useEffect, useRef, useState } from 'react';
import type { MatchView } from '@gacha-triad/shared/platform';
import { LocaleView } from './i18n';
import { ChatMessageContent } from './chat-message-content';
import { useSession } from './session';
import { api } from '../lib/platform';
import { ChannelChat } from './channel-chat';
import { useSocial, openFriendChat } from './social-state';
import { Avatar } from './avatar';
import { NoTranslate } from './i18n';
interface BattleMessage {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
}
export function BattleChat({ match }: { match: MatchView }) {
  const { revision, refresh } = useSession();
  const { data } = useSocial();
  const [tab, setTab] = useState(match.chatAvailable && !match.spectator ? 'battle' : 'general'),
    [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<BattleMessage[]>([]),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null),
    sticky = useRef(true),
    pending = useRef<{ text: string; id: string } | null>(null);
  useEffect(() => {
    if (!match.chatAvailable || match.spectator) return;
    setMessages([]);
    setMessage('');
    pending.current = null;
    sticky.current = true;
  }, [match.id]);
  useEffect(() => {
    if (!match.chatAvailable || match.spectator) return;
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
  }, [match.id, revision, match.chatAvailable, match.spectator]);
  useEffect(() => {
    if (sticky.current && list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [messages.at(-1)?.id]);
  return (
    <LocaleView>
      <section
        className={`menu-window battle-chat arena-comms ${expanded ? 'is-expanded' : ''}`}
        aria-label="Battle chat"
      >
        <button
          className="comms-mobile-toggle"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          Chat {expanded ? '▾' : '▴'}
        </button>
        <div className="arena-chat-tabs" role="tablist" aria-label="Battle chat channels">
          <button role="tab" aria-selected={tab === 'battle'} onClick={() => setTab('battle')}>
            Battle
          </button>
          <button role="tab" aria-selected={tab === 'general'} onClick={() => setTab('general')}>
            General
          </button>
          <button role="tab" aria-selected={tab === 'friends'} onClick={() => setTab('friends')}>
            Friends
          </button>
        </div>
        {tab === 'general' ? (
          <ChannelChat compact />
        ) : tab === 'friends' ? (
          <div className="battle-contacts">
            {data.friends
              .filter((f) => f.status === 'friend')
              .map((f) => (
                <button key={f.id} onClick={() => openFriendChat(f.id)}>
                  <Avatar card={f.avatar} name={f.name} />
                  <span>
                    <NoTranslate>{f.name}</NoTranslate>
                    <small>{f.online ? 'Online' : 'Offline'}</small>
                  </span>
                </button>
              ))}
            {!data.friends.some((f) => f.status === 'friend') && (
              <p>Add friends to start a conversation.</p>
            )}
          </div>
        ) : (
          <>
            <h2 className="window-label">Battle chat</h2>
            {!match.chatAvailable && (
              <p className="battle-chat-unavailable">
                {match.spectator
                  ? 'Battle chat is private to the players. Use General to chat.'
                  : 'Bots cannot reply. Use General or Friends to chat with players.'}
              </p>
            )}
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
              {!messages.length && match.chatAvailable && (
                <p>Only you and your opponent can read this chat.</p>
              )}
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
                if (!match.chatAvailable || match.spectator) return;
                const text = message.trim();
                if (pending.current?.text !== text)
                  pending.current = { text, id: crypto.randomUUID() };
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
                disabled={!match.chatAvailable}
                placeholder="Message your opponent…"
                onChange={(e) => setMessage(e.target.value)}
              />
              <button
                className="primary-button"
                disabled={busy || !message.trim() || !match.chatAvailable}
              >
                Send
              </button>
            </form>
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </section>
    </LocaleView>
  );
}
