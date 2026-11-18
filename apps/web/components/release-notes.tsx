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
          <li>Weekly objectives: complete any three for 150 Prisms.</li>
          <li>Journal: track progress across eight activities.</li>
          <li>Season 0: The First Gathering, with separate records for all three rated formats.</li>
        </ul>
        <Button onClick={() => setOpen(false)}>Back to the game</Button>
      </GameDialog>
    </LocaleView>
  );
}
