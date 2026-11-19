'use client';
import { useId, useRef, useState } from 'react';
import type { Card } from '@gacha-triad/engine';
import { SIDE_NAMES, universeName } from '@gacha-triad/shared';
import { Avatar } from './avatar';
import { Card as PlayingCard } from './card';
import { NoTranslate } from './i18n';
import { Button, GameDialog } from './ui';

const pageSize = 36;
const searchKey = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function ProfileCardPicker({
  cards,
  selected,
  variant,
  onChoose,
  onClose,
}: {
  cards: readonly Card[];
  selected: string | null;
  variant: 'portrait' | 'showcase';
  onChoose: (id: string | null) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(pageSize);
  const portrait = variant === 'portrait';
  const searchLabel = portrait ? 'Search portraits' : 'Search cards';
  const noResults = portrait ? 'No portraits match your search.' : 'No cards match these filters.';
  const noCards = portrait ? 'No owned cards.' : 'No cards available for this slot.';
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
      className="profile-card-picker menu-scrollbar"
    >
      <h2 id={titleId} ref={heading} tabIndex={-1}>
        {portrait ? 'Choose profile card' : 'Choose showcase card'}
      </h2>
      <div className="profile-card-picker-tools">
        <input
          type="search"
          name="profile-card-search"
          aria-label={searchLabel}
          placeholder={searchLabel}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setLimit(pageSize);
          }}
        />
        <Button aria-pressed={selected === null} onClick={() => onChoose(null)}>
          {portrait ? 'Default emblem' : 'None'}
        </Button>
      </div>
      <div className={`profile-card-gallery profile-${variant}-gallery`}>
        {matches.slice(0, limit).map((card) => (
          <button
            type="button"
            className={`profile-card-option profile-${variant}-option`}
            key={card.id}
            aria-pressed={card.id === selected}
            onClick={() => onChoose(card.id)}
          >
            {portrait ? (
              <>
                <Avatar card={card} name={card.name} decorative />
                <strong>
                  <NoTranslate>{card.name}</NoTranslate>
                </strong>
                <small>
                  {card.rarity}★
                  {card.finish === 'holo' && ` · Holo +1 ${SIDE_NAMES[card.holoBonusSide ?? 0]}`}
                </small>
              </>
            ) : (
              <>
                <PlayingCard card={card} showElement />
                {card.finish === 'holo' && <small>Holographic</small>}
              </>
            )}
          </button>
        ))}
      </div>
      {matches.length === 0 && <p role="status">{cards.length ? noResults : noCards}</p>}
      {matches.length > limit && (
        <Button
          className="profile-card-picker-more"
          onClick={() => setLimit((count) => count + pageSize)}
        >
          Show more
        </Button>
      )}
    </GameDialog>
  );
}
