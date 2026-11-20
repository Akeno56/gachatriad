'use client';
import { LocaleView, NoTranslate } from './i18n';

import { useEffect, useRef, useState } from 'react';
import type { FriendMessage, FriendView } from '@gacha-triad/shared/social';
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
  onInvite,
  embedded = false,
}: {
  playerId: string;
  select: (id: string) => void;
  onInvite?: (friend: FriendView) => void;
  embedded?: boolean;
}) {
  const { data } = useSocial(),
    { profile, revision, refreshSocial } = useSession();
  const friends = data.friends.filter((f) => f.status === 'friend');
  const friend = friends.find((f) => f.id === playerId);
  const conversation = data.conversations.find((c) => c.playerId === playerId);
  const [messages, setMessages] = useState<FriendMessage[] | null>(null),
    [search, setSearch] = useState(''),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null),
    sticky = useRef(true),
    pending = useRef<{ text: string; id: string } | null>(null);
  const currentTarget = useRef(playerId);
  currentTarget.current = playerId;
  useEffect(() => {
    setMessages(null);
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
        if (last && conversation?.unread && !document.hidden) {
          await api(`/friends/${friend.id}/read`, { through: last.id });
          if (active) refreshSocial();
        }
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [friend?.id, conversation?.lastAt, revision, profile?.id, refreshSocial]);
  useEffect(() => {
    if (sticky.current && list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [messages?.at(-1)?.id]);
  return (
    <LocaleView>
      <section
        className={`friend-chat private-comms${embedded ? ' private-comms-embedded' : ' menu-window'}`}
        aria-label="Friend chat"
        data-active={!!friend}
      >
        {!embedded && (
          <div className="conversation-list menu-scrollbar" aria-label="Private conversations">
            <label className="conversation-filter">
              <span className="sr-only">Find a conversation</span>
              <input
                name="friend-chat-input-1"
                type="search"
                placeholder="Find a conversation"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            {!friends.length && <p>Add a friend to start a private conversation.</p>}
            {friends
              .filter((f) => f.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
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
                    <span className={`contact-avatar ${f.online ? 'is-online' : ''}`}>
                      <Avatar card={f.avatar} frameId={f.frameId} name={f.name} />
                    </span>
                    <span>
                      <strong>
                        <NoTranslate>{f.name}</NoTranslate>
                      </strong>
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
                    {thread?.lastAt && (
                      <time dateTime={thread.lastAt}>
                        {new Date(thread.lastAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                    )}
                  </button>
                );
              })}
          </div>
        )}
        <div className="conversation-body">
          {friend ? (
            <>
              <div className="friend-conversation-heading">
                <button
                  className="text-button conversation-back"
                  onClick={() => select('')}
                  aria-label="Back to conversations"
                >
                  ←
                </button>
                <Avatar card={friend.avatar} frameId={friend.frameId} name={friend.name} />
                <div className="conversation-person">
                  <strong>
                    <NoTranslate>{friend.name}</NoTranslate>
                  </strong>
                  <small>{friend.online ? 'Online' : 'Offline'}</small>
                </div>
                {onInvite && (
                  <button className="outline-button" onClick={() => onInvite(friend)}>
                    Invite
                  </button>
                )}
              </div>
              <div
                ref={list}
                className="chat-messages menu-scrollbar"
                role="log"
                aria-live="polite"
                aria-label={`Messages with ${friend.name}`}
                onScroll={() => {
                  const el = list.current;
                  if (el) sticky.current = el.scrollHeight - el.scrollTop - el.clientHeight < 70;
                }}
              >
                {!messages ? <p>Loading…</p> : messages.length === 0 && <p>No messages yet.</p>}
                {messages?.map((m) => (
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
                    refreshSocial();
                  } catch (e) {
                    if (currentTarget.current === target) setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <input
                  name="friend-chat-input-2"
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
            </>
          ) : (
            <div className="conversation-empty">
              <p>Select a friend to send a message.</p>
            </div>
          )}
          <p className="error-message" role="alert">
            {error}
          </p>
        </div>
      </section>
    </LocaleView>
  );
}
