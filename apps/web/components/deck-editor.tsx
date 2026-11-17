'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LocaleView } from './i18n';
import { APP_BASE } from '../lib/connection';
import { routeWithinBase } from '../lib/navigation';
export function DeckLeaveWarning({
  dirty,
  canSave,
  busy,
  save,
  discard,
  error,
}: {
  dirty: boolean;
  canSave: boolean;
  busy: boolean;
  save: () => Promise<boolean>;
  discard: () => void;
  error: string;
}) {
  const router = useRouter(),
    dialog = useRef<HTMLDialogElement>(null);
  const [destination, setDestination] = useState<string | null>(null);
  const leaving = useRef(false);
  useEffect(() => {
    if (destination) dialog.current?.showModal();
    else dialog.current?.close();
  }, [destination]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => {
      if (!leaving.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const click = (event: MouseEvent) => {
      if (
        leaving.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.hasAttribute('download') ||
        (anchor.target && anchor.target !== '_self')
      )
        return;
      const target = new URL(anchor.href);
      if (
        !['http:', 'https:'].includes(target.protocol) ||
        (target.origin === location.origin &&
          target.pathname === location.pathname &&
          target.search === location.search)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      setDestination(target.href);
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', click, true);
    return () => {
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', click, true);
    };
  }, [dirty]);
  function leave() {
    if (!destination) return;
    leaving.current = true;
    const target = new URL(destination);
    setDestination(null);
    const route = routeWithinBase(target.pathname, APP_BASE);
    if (target.origin === location.origin && route !== null)
      router.push(route + target.search + target.hash);
    else location.assign(target.href);
  }
  return (
    <LocaleView>
      <dialog
        ref={dialog}
        className="game-dialog menu-window deck-leave-dialog"
        aria-labelledby="deck-leave-title"
        onCancel={(event) => {
          if (busy) event.preventDefault();
          else setDestination(null);
        }}
      >
        <h2 id="deck-leave-title">Unsaved deck changes</h2>
        <p>Save your deck before leaving, or discard your changes.</p>
        {!canSave && <p>Your deck must be valid before it can be saved.</p>}
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        <div className="result-actions">
          <button
            className="primary-button"
            disabled={!canSave || busy}
            onClick={async () => {
              if (await save()) leave();
            }}
          >
            {busy ? 'Saving…' : 'Save and leave'}
          </button>
          <button
            className="outline-button"
            disabled={busy}
            onClick={() => {
              discard();
              leave();
            }}
          >
            Discard changes
          </button>
          <button className="text-button" disabled={busy} onClick={() => setDestination(null)}>
            Keep editing
          </button>
        </div>
      </dialog>
    </LocaleView>
  );
}
