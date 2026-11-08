'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BattleIdentity } from '@gacha-triad/shared/social';
import { useSession } from './session';
import { Avatar } from './avatar';
import { api } from '../lib/platform';
import { appPath } from '../lib/connection';
import { useSocial } from './social-state';
import { FriendChat } from './friend-chat';
export function SocialPanel() {
  const { profile, refresh, openAccount } = useSession(),
    router = useRouter();
  const { data, error: loadError, ready } = useSocial();
  const [open, setOpen] = useState(false),
    [tab, setTab] = useState('chat'),
    [conversation, setConversation] = useState('');
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(''),
    [results, setResults] = useState<BattleIdentity[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const seen = useRef(new Set<string>()),
    seenOwner = useRef('');
  const [inviteToast, setInviteToast] = useState<{
    id: string;
    name: string;
    count: number;
  } | null>(null);
  const incomingInvitations = data.invitations.filter((inv) => inv.recipient.id === profile?.id);
  useEffect(() => {
    if (!profile?.registered) {
      seenOwner.current = '';
      seen.current.clear();
      setInviteToast(null);
      return;
    }
    if (!ready) return;
    if (seenOwner.current !== profile.id) {
      seenOwner.current = profile.id;
      setInviteToast(null);
      try {
        seen.current = new Set(
          JSON.parse(sessionStorage.getItem(`triad-invites-seen:${profile.id}`) ?? '[]'),
        );
      } catch {
        seen.current = new Set();
      }
    }
    const incoming = data.invitations.filter((inv) => inv.recipient.id === profile.id),
      fresh = incoming.filter((inv) => !seen.current.has(inv.id));
    if (fresh.length) {
      for (const inv of fresh) seen.current.add(inv.id);
      try {
        sessionStorage.setItem(
          `triad-invites-seen:${profile.id}`,
          JSON.stringify([...seen.current].slice(-100)),
        );
      } catch {}
      const last = fresh.at(-1)!;
      setInviteToast({ id: last.id, name: last.sender.name, count: fresh.length });
    }
    setInviteToast((current) =>
      current && incoming.some((inv) => inv.id === current.id) ? current : null,
    );
  }, [data.invitations, profile?.id, profile?.registered, ready]);
  useEffect(() => {
    if (!inviteToast) return;
    const timer = setTimeout(() => setInviteToast(null), 5000);
    return () => clearTimeout(timer);
  }, [inviteToast]);
  const toast = inviteToast && (
    <aside className="duel-invite-toast menu-window" role="status" aria-live="polite">
      <span>
        {inviteToast.count > 1
          ? `${inviteToast.count} duel invitations received`
          : `${inviteToast.name} sent you a duel invitation`}
      </span>
      <button
        className="text-button"
        onClick={() => {
          setTab('invitations');
          setOpen(true);
          setInviteToast(null);
        }}
      >
        View invitation
      </button>
      <button
        className="text-button"
        aria-label="Dismiss invite notification"
        onClick={() => setInviteToast(null)}
      >
        ×
      </button>
    </aside>
  );
  useEffect(() => {
    setResults([]);
    setError('');
    setConversation('');
  }, [profile?.id]);
  useEffect(() => {
    const show = (event: Event) => {
      setConversation((event as CustomEvent<string>).detail);
      setTab('chat');
      setOpen(true);
    };
    window.addEventListener('triad:friend-chat', show);
    return () => window.removeEventListener('triad:friend-chat', show);
  }, []);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  const notifications =
    data.friends.filter((f) => f.status === 'incoming').length +
    data.invitations.filter((i) => i.recipient.id === profile?.id).length +
    data.conversations.reduce((n, c) => n + c.unread, 0);
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
        aria-label={`Friends and private chat${notifications ? ` (${notifications} notifications)` : ''}`}
      >
        Friends &amp; messages {notifications > 0 && <b>{notifications}</b>}
      </button>
      {!open && toast}
      {open && (
        <dialog
          ref={dialog}
          className="game-dialog menu-window social-dialog"
          aria-labelledby="social-title"
          onCancel={() => setOpen(false)}
        >
          <div className="social-heading">
            <h2 id="social-title">Friends &amp; messages</h2>
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
                {t === 'chat' ? (
                  'Friend chat'
                ) : t === 'friends' ? (
                  'Friends'
                ) : (
                  <>
                    Duel invitations{' '}
                    {incomingInvitations.length > 0 && (
                      <b
                        className="notification-count"
                        aria-label={`${incomingInvitations.length} incoming invitations`}
                      >
                        {incomingInvitations.length}
                      </b>
                    )}
                  </>
                )}
              </button>
            ))}
          </div>
          <p className="error-message" role="alert">
            {error || loadError}
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
          {tab === 'chat' && <FriendChat playerId={conversation} select={setConversation} />}
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
                  {!data.friends.some((f) => f.id === p.id) && (
                    <button
                      className="outline-button"
                      disabled={busy}
                      onClick={() => void action('/friends/request', { playerId: p.id })}
                    >
                      Add friend
                    </button>
                  )}
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
                        className="outline-button"
                        onClick={() => {
                          setConversation(f.id);
                          setTab('chat');
                        }}
                      >
                        Message
                      </button>
                    )}
                    {f.status === 'friend' && (
                      <button
                        className="primary-button"
                        disabled={
                          busy ||
                          !!profile?.activeMatchId ||
                          !!profile?.waitingLobbyId ||
                          !!profile?.pendingTrade
                        }
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
                Invitations create a five-minute, human-only Unranked table: Three Open, Same, Plus
                and Combo, with no card trade. Complete the tutorial and prepare a legal deck before
                accepting.
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
          {toast}
        </dialog>
      )}
    </>
  );
}
