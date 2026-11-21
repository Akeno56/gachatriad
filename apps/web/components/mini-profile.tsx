'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { PlayerMiniProfile } from '@gacha-triad/shared/platform';
import { api } from '../lib/platform';
import { useSiteRevision } from '../lib/site-updates';
import { Avatar } from './avatar';
import { ProfileBannerArt } from './astral-art';
import { InviteMatchDialog } from './invite-match-dialog';
import { LocaleView, NoTranslate } from './i18n';
import { useSession } from './session';
import { useSocial } from './social-state';
import { Button } from './ui';

interface Target {
  id: string;
  anchor: HTMLButtonElement;
  pinned: boolean;
}
const PreviewContext = createContext<{
  target: Target | null;
  enter: (id: string, anchor: HTMLButtonElement) => void;
  toggle: (id: string, anchor: HTMLButtonElement) => void;
  leave: (anchor: HTMLButtonElement) => void;
}>({ target: null, enter() {}, toggle() {}, leave() {} });

export function ChatPlayerName({
  id,
  children,
  className = '',
}: {
  id: string;
  className?: string;
  children: ReactNode;
}) {
  const { target, enter, toggle, leave } = useContext(PreviewContext);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <button
      type="button"
      className={`chat-player-name ${className}`}
      ref={button}
      aria-haspopup="dialog"
      aria-expanded={!!target && target.anchor === button.current}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') enter(id, event.currentTarget);
      }}
      onPointerLeave={(event) => leave(event.currentTarget)}
      onClick={(event) => toggle(id, event.currentTarget)}
    >
      {children}
    </button>
  );
}

export function MiniProfiles({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { profile } = useSession();
  const [target, setTarget] = useState<Target | null>(null);
  const [invite, setInvite] = useState<{
    player: PlayerMiniProfile;
    anchor: HTMLButtonElement;
  } | null>(null);
  const [loaded, setLoaded] = useState<{
    key: string;
    player?: PlayerMiniProfile;
    error?: string;
  }>();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panel = useRef<HTMLElement>(null);
  const cache = useRef(new Map<string, { player: PlayerMiniProfile; time: number }>());
  const activeId = target?.id;
  const revision = useSiteRevision('identity', activeId);
  const key = `${profile?.id ?? ''}:${activeId ?? ''}:${revision}`;
  function clearTimer() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }
  function close() {
    clearTimer();
    setTarget(null);
  }
  function scheduleClose() {
    clearTimer();
    timer.current = setTimeout(() => setTarget(null), 180);
  }
  useEffect(() => {
    setTarget(null);
    setInvite(null);
    return clearTimer;
  }, [pathname, profile?.id]);
  useEffect(() => {
    if (!activeId) return;
    const saved = cache.current.get(key);
    if (saved && Date.now() - saved.time < 15_000) {
      setLoaded({ key, player: saved.player });
      return;
    }
    setLoaded(undefined);
    let active = true;
    void api<PlayerMiniProfile>(`/players/${encodeURIComponent(activeId)}/mini`)
      .then((player) => {
        if (!active) return;
        if (cache.current.size >= 24) cache.current.clear();
        cache.current.set(key, { player, time: Date.now() });
        setLoaded({ key, player });
      })
      .catch((error: Error) => active && setLoaded({ key, error: error.message }));
    return () => {
      active = false;
    };
  }, [activeId, key]);
  useLayoutEffect(() => {
    const element = panel.current;
    if (!target || !element) return;
    const { anchor, pinned } = target;
    function place() {
      const rect = anchor.getBoundingClientRect();
      if (!anchor.isConnected || rect.bottom <= 0 || rect.top >= innerHeight) {
        setTarget(null);
        return;
      }
      if (!element) return;
      const { offsetWidth, offsetHeight } = element;
      const below = rect.bottom + 6;
      const above = rect.top - offsetHeight - 6;
      const top = below + offsetHeight + 8 <= innerHeight || above < 8 ? below : above;
      element.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - offsetWidth - 8))}px`;
      element.style.top = `${Math.max(8, Math.min(top, innerHeight - offsetHeight - 8))}px`;
    }
    function outside(event: PointerEvent) {
      if (!element?.contains(event.target as Node) && !anchor.contains(event.target as Node))
        close();
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close();
      if (pinned) anchor.focus({ preventScroll: true });
    }
    const observer = new ResizeObserver(place);
    observer.observe(element);
    place();
    if (pinned) element.focus({ preventScroll: true });
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [target]);
  const host = target && document.querySelector('.game-shell');
  const content = loaded?.key === key ? loaded : undefined;
  return (
    <PreviewContext.Provider
      value={{
        target,
        enter(id, anchor) {
          clearTimer();
          if (target?.pinned || target?.anchor === anchor) return;
          timer.current = setTimeout(() => setTarget({ id, anchor, pinned: false }), 250);
        },
        toggle(id, anchor) {
          clearTimer();
          setTarget((old) =>
            old?.anchor === anchor && old.pinned ? null : { id, anchor, pinned: true },
          );
        },
        leave(anchor) {
          clearTimer();
          if (target?.anchor === anchor && !target.pinned) scheduleClose();
        },
      }}
    >
      {children}
      {target &&
        host &&
        createPortal(
          <LocaleView>
            <section
              ref={panel}
              tabIndex={-1}
              role="dialog"
              aria-label="Player preview"
              className="menu-window mini-profile"
              onPointerEnter={clearTimer}
              onPointerLeave={() => {
                if (!target.pinned) scheduleClose();
              }}
              onFocus={clearTimer}
            >
              <button
                type="button"
                className="dialog-close"
                aria-label="Close player preview"
                onClick={() => {
                  close();
                  target.anchor.focus({ preventScroll: true });
                }}
              >
                ×
              </button>
              {content?.player ? (
                <MiniProfileBody
                  key={content.player.id}
                  player={content.player}
                  onNavigate={close}
                  onInvite={() => {
                    if (content.player)
                      setInvite({ player: content.player, anchor: target.anchor });
                    close();
                  }}
                />
              ) : (
                <p className="mini-profile-status" role={content?.error ? 'alert' : 'status'}>
                  {content?.error || 'Loading…'}
                </p>
              )}
            </section>
          </LocaleView>,
          host,
        )}
      {invite && (
        <InviteMatchDialog
          player={invite.player}
          onClose={() => {
            setInvite(null);
            requestAnimationFrame(() => invite.anchor.focus({ preventScroll: true }));
          }}
        />
      )}
    </PreviewContext.Provider>
  );
}

function MiniProfileBody({
  player,
  onNavigate,
  onInvite,
}: {
  player: PlayerMiniProfile;
  onNavigate: () => void;
  onInvite: () => void;
}) {
  const { profile, refreshSocial } = useSession();
  const { data, ready } = useSocial();
  const friend = data.friends.find(({ id }) => id === player.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const self = profile?.id === player.id;
  const ratings = [
    ['Ranked', player.rating],
    ['Ranked Random', player.rankedRandomRating],
    ['Draft', player.draftRating],
    ['Shared Draft', player.sharedDraftRating],
  ] as const;
  async function addFriend() {
    setBusy(true);
    setError('');
    try {
      if (friend?.status === 'incoming')
        await api(`/friends/${encodeURIComponent(player.id)}/accept`, {});
      else await api('/friends/request', { playerId: player.id });
      setSent(true);
      refreshSocial();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <LocaleView>
      <div className="mini-profile-heading" data-profile-banner={player.bannerId}>
        <ProfileBannerArt bannerId={player.bannerId} />
        <Avatar card={player.avatar} name={player.name} frameId={player.frameId} />
        <div>
          <Link href={`/profile?id=${encodeURIComponent(player.id)}`} onClick={onNavigate}>
            <NoTranslate>{player.name}</NoTranslate>
          </Link>
          {player.title && <small>{player.title}</small>}
        </div>
      </div>
      {!player.isBot && (
        <dl className="mini-profile-ratings" aria-label="Ratings">
          {ratings.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {ready && profile?.registered && !self && !player.isBot && (
        <div className="mini-profile-actions">
          {friend?.status === 'friend' ? (
            <>
              <Link
                className="outline-button"
                href={`/social?tab=messages&player=${encodeURIComponent(player.id)}`}
                onClick={onNavigate}
              >
                Message
              </Link>
              <Button onClick={onInvite}>Invite to duel</Button>
            </>
          ) : friend?.status === 'outgoing' || sent ? (
            <span role="status">Friend request sent</span>
          ) : (
            <Button busy={busy} onClick={() => void addFriend()}>
              {friend?.status === 'incoming' ? 'Accept friend' : 'Add friend'}
            </Button>
          )}
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </LocaleView>
  );
}
