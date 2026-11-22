'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useRef, useState } from 'react';
import type { BattleIdentity, FriendView } from '@gacha-triad/shared/social';
import { Avatar } from '../../components/avatar';
import { FriendChat } from '../../components/friend-chat';
import { LocaleView, LocalizedDate, NoTranslate } from '../../components/i18n';
import { useSession } from '../../components/session';
import { useSocial } from '../../components/social-state';
import { useActionNotice } from '../../components/action-notice';
import { Button, Tabs } from '../../components/ui';
import { InviteMatchDialog } from '../../components/invite-match-dialog';
import { ruleNames } from '../../lib/rules';
import { api } from '../../lib/platform';

function SocialIdentity({ player, status }: { player: BattleIdentity; status?: string }) {
  return (
    <LocaleView>
      <div className="social-identity">
        <Avatar card={player.avatar} frameId={player.frameId} name={player.name} />
        <div>
          <h3>
            {player.id ? (
              <Link href={`/profile?id=${encodeURIComponent(player.id)}`}>
                <NoTranslate>{player.name}</NoTranslate>
              </Link>
            ) : (
              <NoTranslate>{player.name}</NoTranslate>
            )}
          </h3>
          {status && <small>{status}</small>}
          {player.title && <small>{player.title}</small>}
        </div>
      </div>
    </LocaleView>
  );
}

function SocialPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { profile, refresh, openAccount, refreshSocial } = useSession();
  const { data, error: loadError, ready } = useSocial();
  const notice = useActionNotice();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BattleIdentity[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [inviteFriend, setInviteFriend] = useState<FriendView | null>(null);
  const [acceptedCorrespondence, setAcceptedCorrespondence] = useState<string>();
  const lock = useRef(false);

  const section = params.get('tab');
  const tab = section === 'messages' || section === 'inbox' ? section : 'friends';
  const playerId = params.get('player') ?? '';
  const friends = data.friends.filter(({ status }) => status === 'friend');
  const requests = data.friends.filter(({ status }) => status !== 'friend');
  const incoming = data.invitations.filter(({ recipient }) => recipient.id === profile?.id);
  const sent = data.invitations.filter(({ sender }) => sender.id === profile?.id);
  const turns = data.correspondenceTurns ?? [];
  const unread = data.conversations.filter(
    (conversation) =>
      conversation.unread > 0 && friends.some(({ id }) => id === conversation.playerId),
  );
  const inviteBusy =
    !!profile?.activeMatchId || !!profile?.waitingLobbyId || !!profile?.pendingTrade;
  const acceptBlocked = profile?.waitingLobbyId
    ? 'Leave your queue or lobby to accept.'
    : inviteBusy
      ? 'Finish your current duel to accept.'
      : '';
  function select(next: string, player = '') {
    const url = new URL(location.href);
    url.searchParams.set('tab', next);
    url.searchParams.delete('invite');
    if (player) url.searchParams.set('player', player);
    else url.searchParams.delete('player');
    history.replaceState(null, '', url);
    setError('');
  }
  function openInvite(friend: FriendView) {
    setError('');
    setInviteFriend(friend);
  }
  async function act(path: string, body: unknown, message?: string, method?: string) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ matchId?: string | null; correspondence?: boolean }>(
        path,
        body,
        method,
      );
      refreshSocial();
      if (path.startsWith('/invites')) await refresh();
      if (result.matchId && result.correspondence) setAcceptedCorrespondence(result.matchId);
      else if (result.matchId) router.push(`/?match=${encodeURIComponent(result.matchId)}`);
      if (message) notice(message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      refreshSocial();
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <LocaleView>
      <div className="content-page social-page">
        <header className="social-page-header">
          <h1>Social</h1>
          <Link className="outline-button" href="/">
            Back to play
          </Link>
        </header>
        {profile && !profile.registered ? (
          <section className="menu-window social-account">
            <p>Sign in to add friends, send messages, and invite players.</p>
            <Button variant="primary" onClick={openAccount}>
              Register or sign in
            </Button>
          </section>
        ) : (
          <>
            <Tabs
              label="Social sections"
              panelId="social-content"
              value={tab}
              onChange={select}
              items={[
                { value: 'friends', label: 'Friends' },
                { value: 'messages', label: 'Messages' },
                { value: 'inbox', label: 'Inbox' },
              ]}
            />
            {!inviteFriend && (error || loadError) && (
              <p role="alert" className="error-message">
                {error || loadError}
              </p>
            )}
            <div
              id="social-content"
              role="tabpanel"
              aria-label={tab === 'friends' ? 'Friends' : tab === 'messages' ? 'Messages' : 'Inbox'}
            >
              {!ready && !loadError ? (
                <p role="status">Loading…</p>
              ) : tab === 'messages' ? (
                <FriendChat
                  playerId={playerId}
                  select={(id) => select('messages', id)}
                  onInvite={openInvite}
                />
              ) : tab === 'friends' ? (
                <>
                  <form
                    className="menu-window social-search"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      if (searching || query.trim().length < 2) return;
                      setSearching(true);
                      setError('');
                      try {
                        setResults(
                          await api<BattleIdentity[]>(
                            `/players/search?search=${encodeURIComponent(query.trim())}`,
                          ),
                        );
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setSearching(false);
                      }
                    }}
                  >
                    <label>
                      Find a player
                      <input
                        name="playerSearch"
                        type="search"
                        value={query}
                        minLength={2}
                        maxLength={60}
                        placeholder="Name or profile ID"
                        required
                        onChange={(event) => setQuery(event.target.value)}
                      />
                    </label>
                    <Button type="submit" busy={searching} disabled={query.trim().length < 2}>
                      Search players
                    </Button>
                  </form>
                  {results && (
                    <section className="social-section" aria-labelledby="social-search-results">
                      <h2 id="social-search-results">Search results</h2>
                      {results.length === 0 && <p>No players found.</p>}
                      <div className="social-grid">
                        {results.map((player) => {
                          const id = player.id;
                          if (!id) return null;
                          const relationship = data.friends.find((friend) => friend.id === id);
                          return (
                            <article className="menu-window social-card" key={id}>
                              <SocialIdentity player={player} />
                              <div className="social-card-actions">
                                {relationship?.status === 'friend' ? (
                                  <Button onClick={() => select('messages', id)}>Message</Button>
                                ) : relationship ? (
                                  <span>
                                    {relationship.status === 'incoming'
                                      ? 'Incoming request'
                                      : 'Request sent'}
                                  </span>
                                ) : (
                                  <Button
                                    disabled={busy}
                                    onClick={() =>
                                      void act(
                                        '/friends/request',
                                        { playerId: id },
                                        'Friend request sent.',
                                      )
                                    }
                                  >
                                    Add friend
                                  </Button>
                                )}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  )}
                  <section className="social-section" aria-labelledby="social-friends">
                    <h2 id="social-friends">Your friends</h2>
                    {friends.length === 0 && <p>No friends yet.</p>}
                    <div className="social-grid social-friends-grid">
                      {friends.map((friend) => (
                        <article className="menu-window social-card" key={friend.id}>
                          <SocialIdentity
                            player={friend}
                            status={friend.online ? 'Online' : 'Offline'}
                          />
                          <div className="social-card-actions">
                            <Button onClick={() => select('messages', friend.id)}>Message</Button>
                            <Button onClick={() => openInvite(friend)} disabled={busy}>
                              Invite
                            </Button>
                            <Button
                              variant="ghost"
                              disabled={busy}
                              onClick={() =>
                                void act(
                                  `/friends/${friend.id}`,
                                  undefined,
                                  'Friend removed.',
                                  'DELETE',
                                )
                              }
                            >
                              Remove friend
                            </Button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                </>
              ) : (
                <>
                  {acceptedCorrespondence && (
                    <p className="social-accepted" role="status">
                      Match accepted.{' '}
                      <Link href={`/?correspondence=${encodeURIComponent(acceptedCorrespondence)}`}>
                        Open match
                      </Link>
                    </p>
                  )}
                  {turns.length > 0 && (
                    <section className="social-section" aria-labelledby="social-turns">
                      <div className="social-turns-heading">
                        <h2 id="social-turns">Correspondence · Your turn</h2>
                        <Link className="text-button" href="/correspondence">
                          All correspondence matches
                        </Link>
                      </div>
                      <div className="social-grid">
                        {turns.map(({ id, opponent, deadline }) => (
                          <article
                            className="menu-window social-card"
                            data-incoming="true"
                            key={id}
                          >
                            <h3>
                              <NoTranslate>{opponent}</NoTranslate>
                            </h3>
                            {deadline !== null && (
                              <small>
                                Turn due{' '}
                                <LocalizedDate
                                  value={deadline}
                                  format="datetime"
                                  options={{
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  }}
                                />
                              </small>
                            )}
                            <div className="social-card-actions">
                              <Link
                                className="primary-button"
                                href={`/?correspondence=${encodeURIComponent(id)}`}
                              >
                                Resume match
                              </Link>
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  )}
                  <section className="social-section" aria-labelledby="social-invites">
                    <h2 id="social-invites">Duel invitations</h2>
                    {incoming.length + sent.length === 0 && <p>No pending invitations.</p>}
                    {acceptBlocked && incoming.some((invitation) => !invitation.turnHours) && (
                      <p>{acceptBlocked}</p>
                    )}
                    <div className="social-grid">
                      {[...incoming, ...sent].map((invitation) => {
                        const received = invitation.recipient.id === profile?.id;
                        const path = `/invites/${invitation.id}/respond`;
                        return (
                          <article
                            className="menu-window social-card"
                            data-incoming={received}
                            key={invitation.id}
                          >
                            <SocialIdentity
                              player={received ? invitation.sender : invitation.recipient}
                            />
                            <div className="social-invite-meta">
                              <strong>
                                {invitation.turnHours
                                  ? received
                                    ? 'Correspondence invitation'
                                    : 'Correspondence invitation sent'
                                  : received
                                    ? 'Live duel invitation'
                                    : 'Live duel invitation sent'}
                              </strong>
                              {invitation.turnHours && (
                                <small>{`${invitation.turnHours}h per turn`}</small>
                              )}
                              {invitation.rules && (
                                <div className="rule-badges">
                                  {ruleNames(invitation.rules).map((rule) => (
                                    <span key={rule}>{rule}</span>
                                  ))}
                                </div>
                              )}
                              <small>
                                Expires{' '}
                                <LocalizedDate
                                  value={invitation.expiresAt}
                                  format={invitation.turnHours ? 'datetime' : 'time'}
                                  options={{
                                    ...(invitation.turnHours
                                      ? { month: 'short', day: 'numeric' }
                                      : {}),
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  }}
                                />
                              </small>
                            </div>
                            <div className="social-card-actions">
                              {received && (
                                <Button
                                  variant="primary"
                                  disabled={busy || (!invitation.turnHours && !!acceptBlocked)}
                                  onClick={() => void act(path, { accept: true })}
                                >
                                  {invitation.turnHours ? 'Accept match' : 'Accept duel'}
                                </Button>
                              )}
                              <Button
                                disabled={busy}
                                onClick={() => void act(path, { accept: false })}
                              >
                                {received ? 'Decline' : 'Cancel invitation'}
                              </Button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                  <section className="social-section" aria-labelledby="social-requests">
                    <h2 id="social-requests">Friend requests</h2>
                    {requests.length === 0 && <p>No pending friend requests.</p>}
                    <div className="social-grid">
                      {requests.map((friend) => (
                        <article
                          className="menu-window social-card"
                          data-incoming={friend.status === 'incoming'}
                          key={friend.id}
                        >
                          <SocialIdentity
                            player={friend}
                            status={
                              friend.status === 'incoming' ? 'Incoming request' : 'Request sent'
                            }
                          />
                          <div className="social-card-actions">
                            {friend.status === 'incoming' && (
                              <Button
                                variant="primary"
                                disabled={busy}
                                onClick={() =>
                                  void act(
                                    `/friends/${friend.id}/accept`,
                                    {},
                                    'Friend request accepted.',
                                  )
                                }
                              >
                                Accept friend
                              </Button>
                            )}
                            <Button
                              disabled={busy}
                              onClick={() =>
                                void act(`/friends/${friend.id}`, undefined, undefined, 'DELETE')
                              }
                            >
                              {friend.status === 'incoming' ? 'Decline request' : 'Cancel request'}
                            </Button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                  {unread.length > 0 && (
                    <section className="social-section" aria-labelledby="social-unread">
                      <h2 id="social-unread">Unread messages</h2>
                      <div className="social-grid">
                        {unread.map((conversation) => {
                          const friend = friends.find(({ id }) => id === conversation.playerId)!;
                          return (
                            <article className="menu-window social-card" key={friend.id}>
                              <SocialIdentity
                                player={friend}
                                status={`${conversation.unread} unread messages`}
                              />
                              <p className="social-message-preview">
                                <NoTranslate>{conversation.lastMessage}</NoTranslate>
                              </p>
                              <Button onClick={() => select('messages', friend.id)}>
                                Read messages
                              </Button>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>
          </>
        )}
        {inviteFriend && (
          <InviteMatchDialog
            player={inviteFriend}
            preferCorrespondence={params.get('invite') === 'correspondence'}
            onClose={() => setInviteFriend(null)}
            onSent={() => select('inbox')}
          />
        )}
      </div>
    </LocaleView>
  );
}

export default function Page() {
  const { profile } = useSession();
  return (
    <Suspense fallback={null}>
      <SocialPage key={profile?.id} />
    </Suspense>
  );
}
