'use client';
import { LocaleView, NoTranslate, LocalizedDate } from './i18n';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BattleIdentity } from '@gacha-triad/shared/social';
import { CORRESPONDENCE_HOURS, type CorrespondenceHours } from '@gacha-triad/shared/platform';
import { useSession } from './session';
import { Avatar } from './avatar';
import { api } from '../lib/platform';
import { appPath } from '../lib/connection';
import { useSocial } from './social-state';
import { FriendChat } from './friend-chat';
import { GameDialog } from './ui';
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
  const [correspondenceFriend, setCorrespondenceFriend] = useState<BattleIdentity | null>(null);
  const [turnHours, setTurnHours] = useState<CorrespondenceHours>(48);
  const [acceptedCorrespondence, setAcceptedCorrespondence] = useState(false);
  const seen = useRef(new Set<string>()),
    seenOwner = useRef('');
  const [inviteToast, setInviteToast] = useState<{
    id: string;
    name: string;
    count: number;
  } | null>(null);
  const incomingInvitations = data.invitations.filter((inv) => inv.recipient.id === profile?.id);
  const acceptBlocked = profile?.waitingLobbyId
    ? 'Leave your queue or lobby to accept.'
    : profile?.activeMatchId || profile?.pendingTrade
      ? 'Finish your current duel to accept.'
      : '';
  function openInvitations() {
    setTab('invitations');
    setOpen(true);
    setError('');
    setInviteToast(null);
  }
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
      <button className="text-button" onClick={openInvitations}>
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
    setAcceptedCorrespondence(false);
    setCorrespondenceFriend(null);
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
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !correspondenceFriend) setOpen(false);
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [open, correspondenceFriend]);
  const notifications =
    data.friends.filter((f) => f.status === 'incoming').length +
    data.invitations.filter((i) => i.recipient.id === profile?.id).length +
    data.conversations.reduce((n, c) => n + c.unread, 0);
  useEffect(() => {
    const show = () => {
      setOpen(true);
      setTab('friends');
    };
    window.addEventListener('triad:open-friends', show);
    return () => window.removeEventListener('triad:open-friends', show);
  }, []);
  async function action(path: string, body?: unknown, method?: string) {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ matchId?: string | null; correspondence?: boolean }>(
        path,
        body,
        method,
      );
      await refresh();
      if (result.matchId) {
        if (result.correspondence) setAcceptedCorrespondence(true);
        else {
          setOpen(false);
          router.push(`/?match=${result.matchId}`);
        }
      }
      return true;
    } catch (e) {
      setError((e as Error).message);
      if (path.startsWith('/invites/')) await refresh();
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <LocaleView>
      <>
        {incomingInvitations.length > 0 && (
          <button
            className="duel-invite-launcher outline-button"
            aria-controls={open ? 'social-drawer' : undefined}
            aria-expanded={open && tab === 'invitations'}
            onClick={openInvitations}
          >
            Duel invitations <b>{incomingInvitations.length}</b>
          </button>
        )}
        <button
          className="social-launcher outline-button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={`Friends and private chat${notifications ? ` (${notifications} notifications)` : ''}`}
          title="Friends & messages"
        >
          <svg
            className="social-launcher-icon"
            width="23"
            height="23"
            viewBox="0 0 24 24"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M3 4h18v13H10l-5 4v-4H3Z" />
            <path d="M7 8h10M7 12h7" />
          </svg>
          <span className="social-launcher-label">Friends &amp; messages</span>{' '}
          {notifications > 0 && <b>{notifications}</b>}
        </button>
        {!open && toast}
        {open && (
          <aside
            id="social-drawer"
            role="dialog"
            aria-modal="false"
            className={`menu-window social-dialog messenger-drawer ${tab === 'invitations' ? 'is-invitations' : ''}`}
            aria-labelledby="social-title"
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
                      name="social-panel-input-1"
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
                    <Avatar
                      key={p.avatar?.id ?? p.id}
                      card={p.avatar}
                      frameId={p.frameId}
                      name={p.name}
                    />
                    <a href={appPath(`/profile?id=${p.id}`)}>
                      <NoTranslate>{p.name}</NoTranslate>
                    </a>
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
                    <Avatar
                      key={f.avatar?.id ?? f.id}
                      card={f.avatar}
                      frameId={f.frameId}
                      name={f.name}
                    />
                    <div>
                      <a href={appPath(`/profile?id=${f.id}`)}>
                        <NoTranslate>{f.name}</NoTranslate>
                      </a>
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
                      {f.status === 'friend' && (
                        <button
                          className="outline-button"
                          disabled={busy}
                          onClick={() => {
                            setError('');
                            setTurnHours(48);
                            setCorrespondenceFriend(f);
                          }}
                        >
                          Correspondence
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
              <section className="duel-invite-inbox menu-scrollbar" aria-label="Duel invitations">
                {acceptedCorrespondence && (
                  <p role="status">
                    Match accepted.{' '}
                    <button
                      className="text-button"
                      onClick={() => {
                        setAcceptedCorrespondence(false);
                        setOpen(false);
                        router.push('/correspondence');
                      }}
                    >
                      Your turn
                    </button>
                  </p>
                )}
                {!data.invitations.length && (
                  <p>{ready ? 'No pending invitations.' : 'Loading…'}</p>
                )}
                {incomingInvitations.some((inv) => !inv.turnHours) && acceptBlocked && (
                  <p role="status">{acceptBlocked}</p>
                )}
                {[
                  ...incomingInvitations,
                  ...data.invitations.filter((inv) => inv.sender.id === profile?.id),
                ].map((inv) => {
                  const incoming = inv.recipient.id === profile?.id,
                    p = incoming ? inv.sender : inv.recipient;
                  return (
                    <div className="friend-row" key={inv.id}>
                      <Avatar
                        key={p.avatar?.id ?? p.id}
                        card={p.avatar}
                        frameId={p.frameId}
                        name={p.name}
                      />
                      <div>
                        <strong>
                          <NoTranslate>{p.name}</NoTranslate>
                        </strong>
                        <small>
                          {inv.turnHours
                            ? `Correspondence · ${inv.turnHours}h per turn`
                            : incoming
                              ? 'Invited you to a duel'
                              : 'Waiting for a reply'}
                        </small>
                        <small>
                          Expires{' '}
                          <LocalizedDate
                            value={inv.expiresAt}
                            format={inv.turnHours ? 'datetime' : 'time'}
                            options={
                              inv.turnHours
                                ? {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  }
                                : { hour: '2-digit', minute: '2-digit' }
                            }
                          />
                        </small>
                      </div>
                      <div className="friend-actions">
                        {incoming && (
                          <button
                            className="primary-button"
                            disabled={busy || (!inv.turnHours && !!acceptBlocked)}
                            onClick={() =>
                              void action(`/invites/${inv.id}/respond`, { accept: true })
                            }
                          >
                            {inv.turnHours ? 'Accept match' : 'Accept duel'}
                          </button>
                        )}
                        <button
                          className="outline-button"
                          disabled={busy}
                          onClick={() =>
                            void action(`/invites/${inv.id}/respond`, { accept: false })
                          }
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
            <GameDialog
              open={!!correspondenceFriend}
              onClose={() => setCorrespondenceFriend(null)}
              labelledBy="correspondence-invite-title"
              className="correspondence-invite-dialog"
              closeLabel="Close dialog"
            >
              <h2 id="correspondence-invite-title">Correspondence</h2>
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (
                    correspondenceFriend &&
                    (await action('/invites', {
                      playerId: correspondenceFriend.id,
                      turnHours,
                    }))
                  ) {
                    setCorrespondenceFriend(null);
                    setTab('invitations');
                  }
                }}
              >
                <p>
                  <NoTranslate>{correspondenceFriend?.name}</NoTranslate>
                </p>
                <label>
                  Hours per turn
                  <select
                    name="turnHours"
                    value={turnHours}
                    onChange={(event) => {
                      const hours = CORRESPONDENCE_HOURS.find(
                        (value) => value === Number(event.target.value),
                      );
                      if (hours) setTurnHours(hours);
                    }}
                  >
                    {CORRESPONDENCE_HOURS.map((hours) => (
                      <option value={hours} key={hours}>
                        {hours}
                      </option>
                    ))}
                  </select>
                </label>
                <p>Unrated · No card loss</p>
                {error && (
                  <p className="error-message" role="alert">
                    {error}
                  </p>
                )}
                <button className="primary-button" disabled={busy}>
                  Send invitation
                </button>
              </form>
            </GameDialog>
          </aside>
        )}
      </>
    </LocaleView>
  );
}
