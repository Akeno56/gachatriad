'use client';
import { useEffect, useRef, useState } from 'react';
import type { MatchView } from '@gacha-triad/shared/platform';
import { BATTLE_STAMPS, type BattleMessage, type BattleStampId } from '@gacha-triad/shared/social';
import { LocaleView, NoTranslate } from './i18n';
import { ChatMessageContent } from './chat-message-content';
import { useSession } from './session';
import { api } from '../lib/platform';
import { ChannelChat } from './channel-chat';
import { useSocial } from './social-state';
import { FriendChat } from './friend-chat';
import { Avatar } from './avatar';
import { Tabs } from './ui';
type ChatDraft = { message: string } | { stampId: BattleStampId };
export function BattleChat({ match }: { match: MatchView }) {
  const { revision, battleChatRevision, refreshBattleChat } = useSession();
  const { data } = useSocial();
  const [tab, setTab] = useState(match.chatAvailable && !match.spectator ? 'battle' : 'general'),
    [expanded, setExpanded] = useState(false);
  const [contact, setContact] = useState('');
  const [messages, setMessages] = useState<BattleMessage[]>([]),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [stampsOpen, setStampsOpen] = useState(false);
  const stampsToggle = useRef<HTMLButtonElement>(null);
  const sending = useRef(false);
  const list = useRef<HTMLDivElement>(null),
    sticky = useRef(true),
    pending = useRef<{ key: string; id: string } | null>(null);
  useEffect(() => {
    if (!match.chatAvailable || match.spectator) return;
    setMessages([]);
    setMessage('');
    pending.current = null;
    sticky.current = true;
  }, [match.id]);
  useEffect(() => {
    if (!match.chatAvailable || match.spectator || tab !== 'battle') return;
    let active = true;
    void api<BattleMessage[]>(`/matches/${match.id}/chat`)
      .then((rows) => {
        if (active) {
          setMessages(rows);
          setError('');
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [match.id, revision, battleChatRevision, match.chatAvailable, match.spectator, tab]);
  useEffect(() => {
    if (sticky.current && list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [messages.at(-1)?.id]);
  function closeStamps() {
    setStampsOpen(false);
    stampsToggle.current?.focus({ preventScroll: true });
  }
  async function send(draft: ChatDraft) {
    if (sending.current || !match.chatAvailable || match.spectator) return;
    sending.current = true;
    const key = 'message' in draft ? `text:${draft.message}` : `stamp:${draft.stampId}`;
    if (pending.current?.key !== key) pending.current = { key, id: crypto.randomUUID() };
    setBusy(true);
    setError('');
    try {
      await api(`/matches/${match.id}/chat`, { ...draft, requestId: pending.current.id });
      if ('message' in draft) {
        setMessage((current) => (current.trim() === draft.message ? '' : current));
      } else {
        setStampsOpen(false);
      }
      pending.current = null;
      sticky.current = true;
      refreshBattleChat();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
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
        <Tabs
          className="arena-chat-tabs"
          label="Battle chat channels"
          items={[
            { value: 'battle', label: 'Battle' },
            { value: 'general', label: 'General' },
            { value: 'friends', label: 'Friends' },
          ]}
          value={tab}
          onChange={(value) => {
            setTab(value);
            setStampsOpen(false);
          }}
        />
        {tab === 'general' ? (
          <ChannelChat compact />
        ) : tab === 'friends' &&
          data.friends.some((friend) => friend.id === contact && friend.status === 'friend') ? (
          <FriendChat embedded playerId={contact} select={setContact} />
        ) : tab === 'friends' ? (
          <div className="battle-contacts">
            {data.friends
              .filter((f) => f.status === 'friend')
              .map((f) => (
                <button key={f.id} onClick={() => setContact(f.id)}>
                  <Avatar card={f.avatar} frameId={f.frameId} name={f.name} />
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
            <div className="battle-chat-heading">
              <h2 className="window-label">Battle chat</h2>
              {match.chatAvailable && !match.spectator && (
                <button
                  type="button"
                  ref={stampsToggle}
                  className="outline-button battle-stamps-toggle"
                  aria-expanded={stampsOpen}
                  aria-controls="battle-stamps"
                  onClick={() => setStampsOpen((open) => !open)}
                >
                  Stamps
                </button>
              )}
            </div>
            <div id="battle-stamps" hidden={!stampsOpen || !match.chatAvailable || match.spectator}>
              {stampsOpen && match.chatAvailable && !match.spectator && (
                <div
                  className="battle-stamp-picker"
                  role="group"
                  aria-label="Battle stamps"
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') closeStamps();
                  }}
                >
                  {BATTLE_STAMPS.map((stamp) => (
                    <button
                      className="outline-button"
                      data-stamp={stamp.id}
                      key={stamp.id}
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        stampsToggle.current?.focus({ preventScroll: true });
                        void send({ stampId: stamp.id });
                      }}
                    >
                      <span className="battle-stamp-mark" aria-hidden="true">
                        {stamp.mark}
                      </span>
                      <span>{stamp.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!match.chatAvailable && (
              <p className="battle-chat-unavailable">
                {match.spectator
                  ? 'Battle chat is private to the players. Use General to chat.'
                  : 'Bots cannot reply. Use General or Friends to chat with players.'}
              </p>
            )}
            <div
              className="chat-messages menu-scrollbar"
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
                    stampId={m.stampId}
                    createdAt={m.createdAt}
                  />
                </article>
              ))}
            </div>
            <form
              className="chat-compose"
              onSubmit={(e) => {
                e.preventDefault();
                const text = message.trim();
                if (text) void send({ message: text });
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
