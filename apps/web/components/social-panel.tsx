'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BattleIdentity, SocialView } from '@gacha-triad/shared/social';
import { useSession } from './session';
import { Avatar } from './avatar';
import { api } from '../lib/platform';
import { appPath } from '../lib/connection';
const empty: SocialView = { friends: [], invitations: [], chat: [] };
export function SocialPanel() {
  const { profile, revision, refresh, openAccount } = useSession(),
    router = useRouter();
  const [data, setData] = useState<SocialView>(empty),
    [open, setOpen] = useState(false),
    [tab, setTab] = useState('chat');
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [query, setQuery] = useState(''),
    [results, setResults] = useState<BattleIdentity[]>([]);
  const dialog = useRef<HTMLDialogElement>(null),
    list = useRef<HTMLDivElement>(null),
    sticky = useRef(true),
    pendingMessage = useRef<{ message: string; id: string } | null>(null);
  useEffect(() => {
    setData(empty);
    setResults([]);
    setError('');
  }, [profile?.id]);
  useEffect(() => {
    if (!profile) return;
    let active = true;
    void api<SocialView>('/social')
      .then((next) => {
        if (active) setData(next);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [profile?.id, revision]);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  useEffect(() => {
    if (open && tab === 'chat' && sticky.current && list.current)
      list.current.scrollTop = list.current.scrollHeight;
  }, [open, tab, data.chat.at(-1)?.id]);
  const notifications =
    data.friends.filter((f) => f.status === 'incoming').length +
    data.invitations.filter((i) => i.recipient.id === profile?.id).length;
  async function action(path: string, body?: unknown, method?: string) {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ matchId?: string | null }>(path, body, method);
      await refresh();
      if (result.matchId) {
        setOpen(false);
        router.push(`/?match=${result.matchId}`);
      }
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="social-launcher outline-button"
        onClick={() => setOpen(true)}
        aria-label={`Friends and chat${notifications ? ` (${notifications} notifications)` : ''}`}
      >
        Chat &amp; friends {notifications > 0 && <b>{notifications}</b>}
      </button>
      {open && (
        <dialog
          ref={dialog}
          className="game-dialog menu-window social-dialog"
          aria-labelledby="social-title"
          onCancel={() => setOpen(false)}
        >
          <div className="social-heading">
            <h2 id="social-title">Community</h2>
            <button className="outline-button" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
          <div className="social-tabs" role="tablist" aria-label="Community sections">
            {['chat', 'friends', 'invitations'].map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => {
                  setTab(t);
                  setError('');
                }}
              >
                {t === 'chat' ? 'Main chat' : t === 'friends' ? 'Friends' : 'Duel invitations'}
              </button>
            ))}
          </div>
          <p className="error-message" role="alert">
            {error}
          </p>
          {!profile?.registered && (
            <p>
              Register to chat, add friends and invite players.{' '}
              <button
                className="text-button"
                onClick={() => {
                  setOpen(false);
                  openAccount();
                }}
              >
                Register or sign in
              </button>
            </p>
          )}
          {tab === 'chat' && (
            <section aria-label="Main chat">
              <div
                className="chat-messages"
                ref={list}
                role="log"
                aria-live="polite"
                onScroll={() => {
                  const el = list.current;
                  if (el) sticky.current = el.scrollHeight - el.scrollTop - el.clientHeight < 70;
                }}
              >
                {!data.chat.length && <p>No messages yet.</p>}
                {data.chat.map((m) => (
                  <article key={m.id} className="chat-message">
                    <Avatar key={m.avatar?.id ?? m.playerId} card={m.avatar} name={m.name} />
                    <div>
                      <a href={appPath(`/profile?id=${m.playerId}`)}>{m.name}</a>
                      {m.title && <small>{m.title}</small>}
                      <time dateTime={m.createdAt}>
                        {new Date(m.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                      <p>{m.body}</p>
                    </div>
                    {profile?.isAdmin && (
                      <button
                        className="text-button"
                        disabled={busy}
                        aria-label={`Remove message from ${m.name}`}
                        onClick={() => void action(`/chat/${m.id}`, undefined, 'DELETE')}
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
                  if (!message.trim()) return;
                  const text = message.trim();
                  if (pendingMessage.current?.message !== text)
                    pendingMessage.current = { message: text, id: crypto.randomUUID() };
                  if (
                    await action('/chat', { message: text, requestId: pendingMessage.current.id })
                  ) {
                    setMessage('');
                    pendingMessage.current = null;
                    sticky.current = true;
                  }
                }}
              >
                <label className="sr-only" htmlFor="chat-message">
                  Message
                </label>
                <input
                  id="chat-message"
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
              <small>300 characters maximum · one message every 3 seconds</small>
            </section>
          )}
          {tab === 'friends' && (
            <section aria-label="Friends">
              <form
                className="friend-search"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  try {
                    setResults(
                      await api<BattleIdentity[]>(
                        `/players/search?search=${encodeURIComponent(query)}`,
                      ),
                    );
                    setError('');
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label>
                  Find a player
                  <input
                    value={query}
                    minLength={2}
                    maxLength={60}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Name or profile ID"
                  />
                </label>
                <button className="outline-button" disabled={busy || !profile?.registered}>
                  Search players
                </button>
              </form>
              {results.map((p) => (
                <div className="friend-row" key={p.id}>
                  <Avatar key={p.avatar?.id ?? p.id} card={p.avatar} name={p.name} />
                  <a href={appPath(`/profile?id=${p.id}`)}>{p.name}</a>
                  <button
                    className="outline-button"
                    disabled={busy || data.friends.some((f) => f.id === p.id)}
                    onClick={() => void action('/friends/request', { playerId: p.id })}
                  >
                    Add friend
                  </button>
                </div>
              ))}
              <h3>Your friends &amp; requests</h3>
              {!data.friends.length && <p>No friends or requests yet.</p>}
              {data.friends.map((f) => (
                <div className="friend-row" key={f.id}>
                  <Avatar key={f.avatar?.id ?? f.id} card={f.avatar} name={f.name} />
                  <div>
                    <a href={appPath(`/profile?id=${f.id}`)}>{f.name}</a>
                    {f.title && <small>{f.title}</small>}
                    <small>
                      {f.status === 'friend'
                        ? f.online
                          ? 'Online'
                          : 'Offline'
                        : f.status === 'incoming'
                          ? 'Incoming request'
                          : 'Request sent'}
                    </small>
                  </div>
                  <div className="friend-actions">
                    {f.status === 'incoming' && (
                      <button
                        className="primary-button"
                        disabled={busy}
                        onClick={() => void action(`/friends/${f.id}/accept`, {})}
                      >
                        Accept friend
                      </button>
                    )}
                    {f.status === 'friend' && (
                      <button
                        className="primary-button"
                        disabled={busy || !!profile?.activeMatchId || !!profile?.waitingLobbyId}
                        onClick={() => void action('/invites', { playerId: f.id })}
                      >
                        Invite to duel
                      </button>
                    )}
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => void action(`/friends/${f.id}`, undefined, 'DELETE')}
                    >
                      {f.status === 'friend'
                        ? 'Remove friend'
                        : f.status === 'incoming'
                          ? 'Decline'
                          : 'Cancel request'}
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )}
          {tab === 'invitations' && (
            <section aria-label="Duel invitations">
              <p>
                Invitations create a five-minute, human-only Three Open table with no card trade.
                Complete the tutorial and prepare a legal deck before accepting.
              </p>
              {!data.invitations.length && <p>No pending invitations.</p>}
              {data.invitations.map((inv) => {
                const incoming = inv.recipient.id === profile?.id,
                  p = incoming ? inv.sender : inv.recipient;
                return (
                  <div className="friend-row" key={inv.id}>
                    <Avatar key={p.avatar?.id ?? p.id} card={p.avatar} name={p.name} />
                    <div>
                      <strong>
                        {incoming ? `${p.name} invited you` : `Waiting for ${p.name}`}
                      </strong>
                      <small>
                        Expires{' '}
                        {new Date(inv.expiresAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </small>
                    </div>
                    <div className="friend-actions">
                      {incoming && (
                        <button
                          className="primary-button"
                          disabled={busy}
                          onClick={() =>
                            void action(`/invites/${inv.id}/respond`, { accept: true })
                          }
                        >
                          Accept duel
                        </button>
                      )}
                      <button
                        className="outline-button"
                        disabled={busy}
                        onClick={() => void action(`/invites/${inv.id}/respond`, { accept: false })}
                      >
                        {incoming ? 'Decline duel' : 'Cancel invitation'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </section>
          )}
        </dialog>
      )}
    </>
  );
}
