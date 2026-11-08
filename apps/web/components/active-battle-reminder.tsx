'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from './session';
export function ActiveBattleReminder() {
  const { profile } = useSession(),
    pathname = usePathname(),
    router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null),
    seen = useRef('');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!profile?.activeMatchId || pathname === '/') {
      setOpen(false);
      seen.current = '';
      return;
    }
    const key = `${profile.id}:${profile.activeMatchId}:${pathname}`;
    if (key !== seen.current) {
      seen.current = key;
      setOpen(true);
    }
  }, [pathname, profile?.id, profile?.activeMatchId]);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className="game-dialog menu-window active-battle-reminder"
      aria-labelledby="active-battle-title"
      onCancel={() => setOpen(false)}
    >
      <h2 id="active-battle-title">You have an active battle</h2>
      <p>Your battle is still in progress. Return to the board to play your turn.</p>
      <div className="result-actions">
        <button
          className="primary-button"
          onClick={() => {
            setOpen(false);
            router.push(`/?match=${profile?.activeMatchId}`);
          }}
        >
          Go back to the battle
        </button>
        <button className="outline-button" onClick={() => setOpen(false)}>
          Continue browsing
        </button>
      </div>
    </dialog>
  );
}
