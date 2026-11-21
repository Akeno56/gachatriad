'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import type { PlayerProfileView } from '@gacha-triad/shared/platform';
import { useSession } from './session';
import { useSocial } from './social-state';
import { Button } from './ui';
import { LocaleView } from './i18n';
import { api } from '../lib/platform';
export function ProfileActions({ player }: { player: PlayerProfileView }) {
  const { profile, refresh, refreshSocial } = useSession(),
    { data: social, ready } = useSocial();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const lock = useRef(false),
    friend = social.friends.find((f) => f.id === player.id);
  async function act(path: string, notice: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await api(
        path,
        path === '/friends/request' || path === '/invites' ? { playerId: player.id } : {},
      );
      if (path.startsWith('/friends')) refreshSocial();
      else await refresh();
      setNotice(notice);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <LocaleView>
      <div className="profile-social-actions">
        <Link href="/lobbies" className="outline-button">
          Lobbies
        </Link>
        {!player.isBot && profile?.registered && (
          <>
            {ready && !friend && (
              <Button
                busy={busy}
                onClick={() => void act('/friends/request', 'Friend request sent.')}
              >
                Add friend
              </Button>
            )}
            {friend?.status === 'outgoing' && <span>Friend request sent</span>}
            {friend?.status === 'incoming' && (
              <Button
                busy={busy}
                onClick={() => void act(`/friends/${player.id}/accept`, 'Friend request accepted.')}
              >
                Accept friend
              </Button>
            )}
            {friend?.status === 'friend' && (
              <>
                <Link
                  className="outline-button"
                  href={`/social?tab=messages&player=${encodeURIComponent(player.id)}`}
                >
                  Message
                </Link>
                <Button
                  busy={busy}
                  disabled={
                    !!profile.activeMatchId || !!profile.waitingLobbyId || !!profile.pendingTrade
                  }
                  onClick={() => void act('/invites', 'Invitation sent.')}
                >
                  Invite to duel
                </Button>
              </>
            )}
          </>
        )}
        {notice && <span role="status">{notice}</span>}
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
      </div>
    </LocaleView>
  );
}
