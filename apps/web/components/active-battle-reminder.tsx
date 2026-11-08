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
  const pending = profile?.pendingTrade;
  useEffect(() => {
    const target = pending?.matchId ?? profile?.activeMatchId;
    if (!target || pathname === '/') {
      setOpen(false);
      seen.current = '';
      return;
    }
    const key = `${profile?.id}:${target}:${pending?.canClaim}:${pathname}`;
    if (key !== seen.current) {
      seen.current = key;
      setOpen(true);
    }
  }, [pathname, profile?.id, profile?.activeMatchId, pending?.matchId, pending?.canClaim]);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className="game-dialog menu-window active-battle-reminder"
      aria-labelledby="active-battle-title"
      onCancel={(e) => (pending?.canClaim ? e.preventDefault() : setOpen(false))}
    >
      <h2 id="active-battle-title">
        {pending
          ? pending.canClaim
            ? 'Choose your Trade One card first'
            : 'Trade One is awaiting selection'
          : 'You have an active battle'}
      </h2>
      <p>
        {pending
          ? pending.canClaim
            ? 'Your victory has an unclaimed card. Return to the result and choose the card you want to take before continuing.'
            : 'Your opponent is choosing a card. You cannot start another game until the transfer is resolved. Selection is automatic after two minutes.'
          : 'Your battle is still in progress. Return to the board to play your turn.'}
      </p>
      <div className="result-actions">
        <button
          className="primary-button"
          onClick={() => {
            setOpen(false);
            router.push(`/?match=${pending?.matchId ?? profile?.activeMatchId}`);
          }}
        >
          {pending ? 'Return to card selection' : 'Go back to the battle'}
        </button>
        {!pending?.canClaim && (
          <button className="outline-button" onClick={() => setOpen(false)}>
            Continue browsing
          </button>
        )}
      </div>
    </dialog>
  );
}
