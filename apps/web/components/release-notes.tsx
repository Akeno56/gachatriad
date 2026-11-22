'use client';
import { useRef, useState } from 'react';
import { LocaleView } from './i18n';
import { GameDialog, Button } from './ui';
import { VERSION } from '../lib/release';
export function ReleaseNotes() {
  const [open, setOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
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
      <GameDialog
        open={open}
        onClose={() => setOpen(false)}
        labelledBy="release-title"
        className="release-notes"
        initialFocus={heading}
        closeLabel="Close update notes"
      >
        <div className="eyebrow">Alpha · {VERSION}</div>
        <h2 id="release-title" ref={heading} tabIndex={-1}>
          What’s new
        </h2>
        <ul>
          <li>Admins can schedule lobby events with several rewards.</li>
          <li>Share links to public tables.</li>
          <li>Correspondence invitations and turn reminders in Social.</li>
          <li>Completed duels award 25 Prisms for a win, 13 for a draw, and 5 for a loss.</li>
        </ul>
        <Button onClick={() => setOpen(false)}>Back to the game</Button>
      </GameDialog>
    </LocaleView>
  );
}
