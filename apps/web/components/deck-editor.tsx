'use client';
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import type { ProfileView } from '@gacha-triad/shared/platform';
import { ALL_CARDS } from '@gacha-triad/shared';
import { browseKey } from './browse-preferences';
import { LocaleView } from './i18n';
const known = new Set(ALL_CARDS.map((card) => card.id));
const valid = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length <= 5 &&
  value.every((id) => typeof id === 'string' && known.has(id)) &&
  new Set(value).size === value.length;
export function useDeckEditor(profile: ProfileView | null) {
  const key = profile ? browseKey('deck-draft', profile.id) : '';
  const serverDeck = profile?.deck ?? [],
    signature = serverDeck.join('|');
  const [state, setState] = useState({ owner: '', cards: [] as string[], base: [] as string[] });
  useEffect(() => {
    if (!key) return;
    setState((current) => {
      if (current.owner === key)
        return {
          owner: key,
          cards: current.cards.join('|') === current.base.join('|') ? serverDeck : current.cards,
          base: serverDeck,
        };
      try {
        const saved = JSON.parse(sessionStorage.getItem(key) ?? 'null');
        if (valid(saved?.cards)) return { owner: key, cards: saved.cards, base: serverDeck };
      } catch {}
      return { owner: key, cards: serverDeck, base: serverDeck };
    });
  }, [key, signature]);
  const deck = state.owner === key ? state.cards : serverDeck;
  const dirty = !!profile && state.owner === key && deck.join('|') !== state.base.join('|');
  useEffect(() => {
    if (!key || state.owner !== key) return;
    try {
      if (dirty) sessionStorage.setItem(key, JSON.stringify({ cards: deck }));
      else sessionStorage.removeItem(key);
    } catch {}
  }, [key, state, dirty]);
  const setDeck: Dispatch<SetStateAction<string[]>> = (next) =>
    setState((current) => ({
      owner: key,
      base: current.owner === key ? current.base : serverDeck,
      cards:
        typeof next === 'function'
          ? next(current.owner === key ? current.cards : serverDeck)
          : next,
    }));
  const saved = (cards: string[]) => setState({ owner: key, cards, base: cards });
  const discard = () => {
    saved(serverDeck);
    try {
      sessionStorage.removeItem(key);
    } catch {}
  };
  return { deck, setDeck, dirty, saved, discard };
}
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
    if (target.origin === location.origin)
      router.push(target.pathname + target.search + target.hash);
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
