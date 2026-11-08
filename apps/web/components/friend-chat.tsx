'use client';
import { LocaleView, NoTranslate } from './i18n';

import { useEffect, useRef, useState } from 'react';
import type { FriendMessage } from '@gacha-triad/shared/social';
import { useSession } from './session';
import { useSocial } from './social-state';
import { Avatar } from './avatar';
import { ALL_CARDS } from '@gacha-triad/shared';
import { TITLES } from '@gacha-triad/shared/social';
import { ChatMessageContent } from './chat-message-content';
import { api } from '../lib/platform';
export function FriendChat({
  playerId,
  select,
}: {
  playerId: string;
  select: (id: string) => void;
}) {
  const { data } = useSocial(),
    { profile, revision, refresh } = useSession();
  const friends = data.friends.filter((f) => f.status === 'friend');
  const friend = friends.find((f) => f.id === playerId);
  const [messages, setMessages] = useState<FriendMessage[]>([]),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null),
    sticky = useRef(true),
    pending = useRef<{ text: string; id: string } | null>(null);
  const currentTarget = useRef(playerId);
  currentTarget.current = playerId;
  useEffect(() => {
    setMessages([]);
    setMessage('');
    setError('');
    pending.current = null;
    sticky.current = true;
  }, [playerId, profile?.id]);
  useEffect(() => {
    if (!friend) return;
    let active = true;
    void api<FriendMessage[]>(`/friends/${friend.id}/messages`)
      .then(async (rows) => {
        if (!active) return;
        setMessages(rows);
        setError('');
        const last = rows.filter((m) => m.recipientId === profile?.id).at(-1);
        if (
          last &&
          data.conversations.some((c) => c.playerId === friend.id && c.unread > 0) &&
          !document.hidden
        ) {
          await api(`/friends/${friend.id}/read`, { through: last.id });
          if (active) await refresh();
        }
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [friend?.id, revision, profile?.id, refresh]);
  useEffect(() => {
    if (sticky.current && list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [messages.at(-1)?.id]);
  return (
    <LocaleView>
      <section className="friend-chat" aria-label="Friend chat">
        <div className="conversation-list" aria-label="Private conversations">
          {!friends.length && <p>Add a friend to start a private conversation.</p>}
          {[...friends]
            .sort((a, b) =>
              (data.conversations.find((c) => c.playerId === b.id)?.lastAt ?? '').localeCompare(
                data.conversations.find((c) => c.playerId === a.id)?.lastAt ?? '',
              ),
            )
            .map((f) => {
              const thread = data.conversations.find((c) => c.playerId === f.id);
              return (
                <button
                  key={f.id}
                  className={`conversation-choice ${friend?.id === f.id ? 'is-selected' : ''}`}
                  aria-pressed={friend?.id === f.id}
                  onClick={() => select(f.id)}
                >
                  <Avatar card={f.avatar} name={f.name} />
                  <span>
                    <strong>
                      <NoTranslate>{f.name}</NoTranslate>
                    </strong>
                    {f.title && <small className="friend-chat-title">{f.title}</small>}
                    <small>
                      {thread?.lastMessage ? (
                        <NoTranslate>{thread.lastMessage}</NoTranslate>
                      ) : f.online ? (
                        'Online'
                      ) : (
                        'Offline'
                      )}
                    </small>
                  </span>
                  {!!thread?.unread && <b>{thread.unread}</b>}
                </button>
              );
            })}
        </div>
        <div className="conversation-body">
          {friend ? (
            <>
              <div className="friend-conversation-heading">
                <ChatMessageContent person={friend} />
              </div>
              <small className="conversation-presence">
                {friend.online ? 'Online' : 'Offline'} · Private conversation
              </small>
              <div
                ref={list}
                className="chat-messages"
                role="log"
                aria-live="polite"
                aria-label={`Messages with ${friend.name}`}
                onScroll={() => {
                  const el = list.current;
                  if (el) sticky.current = el.scrollHeight - el.scrollTop - el.clientHeight < 70;
                }}
              >
                {!messages.length && <p>No messages yet. Say hello.</p>}
                {messages.map((m) => (
                  <article
                    key={m.id}
                    className={`private-message ${m.senderId === profile?.id ? 'is-own' : ''}`}
                  >
                    <ChatMessageContent
                      person={
                        m.senderId === profile?.id
                          ? {
                              id: profile.id,
                              name: profile.name,
                              title: TITLES.find((t) => t.id === profile.titleId)?.name ?? null,
                              avatar: ALL_CARDS.find((c) => c.id === profile.avatarCardId) ?? null,
                            }
                          : friend
                      }
                      createdAt={m.createdAt}
                      body={m.body}
                    />
                  </article>
                ))}
              </div>
              <form
                className="chat-compose"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (busy || !message.trim()) return;
                  const target = friend.id,
                    text = message.trim();
                  if (pending.current?.text !== text)
                    pending.current = { text, id: crypto.randomUUID() };
                  setBusy(true);
                  setError('');
                  try {
                    await api(`/friends/${target}/messages`, {
                      message: text,
                      requestId: pending.current.id,
                    });
                    if (currentTarget.current === target) {
                      setMessage('');
                      pending.current = null;
                      sticky.current = true;
                    }
                    await refresh();
                  } catch (e) {
                    if (currentTarget.current === target) setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <input
                  aria-label={`Message ${friend.name}`}
                  placeholder={`Message ${friend.name}…`}
                  maxLength={300}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                <button className="primary-button" disabled={busy || !message.trim()}>
                  Send
                </button>
              </form>
              <small>
                Only you and <NoTranslate>{friend.name}</NoTranslate> can read this conversation.
              </small>
            </>
          ) : (
            <p>Select a friend to open your conversation.</p>
          )}
          <p className="error-message" role="alert">
            {error}
          </p>
        </div>
      </section>
    </LocaleView>
  );
}
