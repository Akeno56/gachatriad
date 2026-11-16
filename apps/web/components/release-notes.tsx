'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LocaleView } from './i18n';
import { VERSION } from '../lib/release';
export function ReleaseNotes() {
  const [open, setOpen] = useState(false),
    [ready, setReady] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => setReady(true), []);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  return (
    <LocaleView>
      <button
        className="release-trigger"
        aria-label="Read update notes"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        Alpha · {VERSION}
      </button>
      {ready &&
        createPortal(
          <LocaleView>
            <dialog
              ref={dialog}
              className="game-dialog menu-window release-notes"
              aria-labelledby="release-title"
              onCancel={() => setOpen(false)}
            >
              <button
                className="dialog-close"
                aria-label="Close update notes"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
              <div className="eyebrow">Alpha · {VERSION}</div>
              <h2 id="release-title">What’s new</h2>
              <ul>
                <li>Daily Triad puzzle with a 100-Prism reward and daily leaderboard.</li>
                <li>
                  Shared Draft: four shared boosters, alternating picks and its own ranked
                  leaderboard. The original Draft stays available.
                </li>
                <li>Ranked without card loss. Keep your deck and queue again.</li>
                <li>Trade One remains available in opt-in custom games.</li>
              </ul>
              <button className="outline-button" onClick={() => setOpen(false)}>
                Back to the game
              </button>
            </dialog>
          </LocaleView>,
          document.body,
        )}
    </LocaleView>
  );
}
