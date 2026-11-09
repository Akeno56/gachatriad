'use client';
import { LocaleView } from './i18n';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from './session';
import { assetPath } from '../lib/connection';
export function StarterBoosters() {
  const { profile, openAccount } = useSession(),
    pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const [watching, setWatching] = useState(false);
  useEffect(() => setWatching(new URLSearchParams(location.search).has('spectate')), [pathname]);
  const needed =
    !watching &&
    !!profile?.starterBoosters &&
    !profile.activeMatchId &&
    ['/', '/lobbies'].includes(pathname.replace(/\/$/, '') || '/');
  useEffect(() => {
    if (needed) dialog.current?.showModal();
    else dialog.current?.close();
  }, [needed]);
  if (!needed) return null;
  return (
    <LocaleView>
      <dialog
        ref={dialog}
        className="game-dialog menu-window starter-welcome"
        aria-labelledby="starter-welcome-title"
        onCancel={(e) => e.preventDefault()}
      >
        <img src={assetPath('/assets/ui/triad-logo.webp')} alt="" draggable={false} />
        <div className="eyebrow">WELCOME TO GACHA TRIAD</div>
        <h2 id="starter-welcome-title">Your first hand starts here</h2>
        <p>Three free Starter boosters. Fifteen cards to build your collection.</p>
        <p className="starter-welcome-details">
          Five cards each · one 3★+ guaranteed · 1% Holo · no 5★ cards
        </p>
        <Link className="primary-button" href="/boosters?starter=1">
          Open my {profile!.starterBoosters} Starter boosters
        </Link>
        <button className="text-button starter-login" onClick={openAccount}>
          Already have an account? Login / Register
        </button>
      </dialog>
    </LocaleView>
  );
}
