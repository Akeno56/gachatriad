'use client';
import { useEffect, useRef, useState } from 'react';
import type { ProfileView } from '@gacha-triad/shared/platform';
import { useSession } from './session';
import { api } from '../lib/platform';
export function confirmRanked(profile: ProfileView | null): Promise<boolean> {
  if (!profile?.registered) return Promise.resolve(false);
  if (profile.rankedAcknowledged) return Promise.resolve(true);
  return new Promise((resolve) =>
    window.dispatchEvent(new CustomEvent('triad:ranked-warning', { detail: resolve })),
  );
}
export function RankedWarning() {
  const { refresh } = useSession(),
    ref = useRef<HTMLDialogElement>(null),
    pending = useRef<((allow: boolean) => void) | null>(null);
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    const request = (event: Event) => {
      pending.current?.(false);
      pending.current = (event as CustomEvent).detail;
      setError('');
      setOpen(true);
    };
    window.addEventListener('triad:ranked-warning', request);
    return () => {
      window.removeEventListener('triad:ranked-warning', request);
      pending.current?.(false);
    };
  }, []);
  useEffect(() => {
    if (open) ref.current?.showModal();
  }, [open]);
  function close(allow: boolean) {
    pending.current?.(allow);
    pending.current = null;
    ref.current?.close();
    setOpen(false);
  }
  return open ? (
    <dialog
      ref={ref}
      className="game-dialog menu-window ranked-warning"
      onCancel={() => close(false)}
      aria-labelledby="ranked-warning-title"
    >
      <h2 id="ranked-warning-title">Ranked puts a card at stake</h2>
      <p>
        Ranked uses Closed hands, Same, Plus, Combo and <strong>Trade One</strong>.
      </p>
      <p>
        <strong>If you lose, your opponent takes one card from your played deck.</strong> This also
        applies if you forfeit. The card leaves your collection, and your active deck may need
        rebuilding. A draw transfers no cards.
      </p>
      <p>
        Your opponents are other players or Medium/Hard bots. Solo practice never changes your
        rating or uses Trade One.
      </p>
      <p role="alert">{error}</p>
      <div className="result-actions">
        <button
          className="primary-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api('/ranked/acknowledge', { acknowledged: true });
              await refresh();
              close(true);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          I understand · Enter ranked
        </button>
        <button className="outline-button" disabled={busy} onClick={() => close(false)}>
          Cancel
        </button>
      </div>
    </dialog>
  ) : null;
}
