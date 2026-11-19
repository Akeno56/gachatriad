'use client';
import { useId, useRef, useState } from 'react';
import type { Card } from '@gacha-triad/engine';
import { SIDE_NAMES, universeName } from '@gacha-triad/shared';
import { Avatar } from './avatar';
import { NoTranslate } from './i18n';
import { Button, GameDialog } from './ui';

const pageSize = 36;
const searchKey = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function ProfilePortraitPicker({
  cards,
  selected,
  onChoose,
  onClose,
}: {
  cards: readonly Card[];
  selected: string | null;
  onChoose: (id: string | null) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(pageSize);
  const terms = searchKey(query.trim()).split(/\s+/).filter(Boolean);
  const matches = terms.length
    ? cards.filter((card) => {
        const label = searchKey(
          `${card.name} ${universeName(card.universeId)} ${card.finish === 'holo' ? 'Holo' : ''}`,
        );
        return terms.every((term) => label.includes(term));
      })
    : cards;

  return (
    <GameDialog
      open
      onClose={onClose}
      labelledBy={titleId}
      initialFocus={heading}
      className="profile-portrait-picker menu-scrollbar"
    >
      <h2 id={titleId} ref={heading} tabIndex={-1}>
        Choose profile card
      </h2>
      <div className="profile-portrait-tools">
        <input
          type="search"
          name="portrait-search"
          aria-label="Search portraits"
          placeholder="Search portraits"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setLimit(pageSize);
          }}
        />
        <Button aria-pressed={selected === null} onClick={() => onChoose(null)}>
          Default emblem
        </Button>
      </div>
      <div className="profile-portrait-gallery">
        {matches.slice(0, limit).map((card) => (
          <button
            type="button"
            className="profile-portrait-option"
            key={card.id}
            aria-pressed={card.id === selected}
            onClick={() => onChoose(card.id)}
          >
            <Avatar card={card} name={card.name} decorative />
            <strong>
              <NoTranslate>{card.name}</NoTranslate>
            </strong>
            <small>
              {card.rarity}★
              {card.finish === 'holo' && ` · Holo +1 ${SIDE_NAMES[card.holoBonusSide ?? 0]}`}
            </small>
          </button>
        ))}
      </div>
      {matches.length === 0 && (
        <p role="status">{cards.length ? 'No portraits match your search.' : 'No owned cards.'}</p>
      )}
      {matches.length > limit && (
        <Button
          className="profile-portrait-more"
          onClick={() => setLimit((count) => count + pageSize)}
        >
          Show more
        </Button>
      )}
    </GameDialog>
  );
}
