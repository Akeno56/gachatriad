'use client';
import { LocaleView, NoTranslate } from '../../components/i18n';

import { useState } from 'react';
import Link from 'next/link';
import { ALL_CARDS as CARDS, UNIVERSES } from '@gacha-triad/shared';
import { Card } from '../../components/card';
import { useSession } from '../../components/session';
import { DuplicateCards } from '../../components/duplicate-cards';
import { useBrowseState, useBrowseScroll } from '../../components/browse-preferences';
import { CardDetail } from '../../components/card-detail';
export default function Collection() {
  const { profile, error: connectionError } = useSession();
  const [search, setSearch] = useBrowseState<string>('collection', 'search', ''),
    [universe, setUniverse] = useBrowseState<string>('collection', 'universe', 'all'),
    [sort, setSort] = useBrowseState<string>('collection', 'sort', 'rarity-desc');
  const [detail, setDetail] = useState<(typeof CARDS)[number] | null>(null);
  useBrowseScroll('collection', !!profile);
  const owned = CARDS.filter(
    (c) =>
      (profile?.inventory[c.id]?.quantity ?? 0) > 0 &&
      c.name.toLowerCase().includes(search.toLowerCase()) &&
      (universe === 'all' || c.universeId === universe),
  ).sort((a, b) => {
    const stats = (card: typeof a) => card.stats.reduce((n, v) => n + v, 0);
    const universeName = (card: typeof a) =>
      UNIVERSES.find((u) => u.id === card.universeId)?.name ?? card.universeId;
    const result =
      sort === 'stats-desc'
        ? stats(b) - stats(a)
        : sort === 'stats-asc'
          ? stats(a) - stats(b)
          : sort === 'rarity-desc'
            ? b.rarity - a.rarity
            : sort === 'rarity-asc'
              ? a.rarity - b.rarity
              : sort === 'universe'
                ? universeName(a).localeCompare(universeName(b))
                : sort === 'name-desc'
                  ? b.name.localeCompare(a.name)
                  : a.name.localeCompare(b.name);
    return result || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
  return (
    <LocaleView>
      <div className="content-page deck-page">
        <div className="eyebrow">YOUR COLLECTION</div>
        <div className="collection-page-heading">
          <h1>Collection</h1>
          <Link className="outline-button" href="/decks" aria-label="Open deck workshop">
            Decks <span aria-hidden="true">→</span>
          </Link>
        </div>
        <p className="page-description">
          Browse your cards, inspect their values and manage duplicates. Build and save your hands
          in Decks.
        </p>
        <DuplicateCards />
        <div className="collection-toolbar">
          <div className="catalog-filters">
            <label>
              Find a card
              <input
                name="page-input-1"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label>
              Universe
              <select
                name="page-select-2"
                aria-label="Universe"
                value={universe}
                onChange={(e) => setUniverse(e.target.value)}
              >
                <option value="all">All universes</option>
                {UNIVERSES.map((u) => (
                  <option key={u.id} value={u.id}>
                    <NoTranslate>{u.name}</NoTranslate>
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="collection-sort">
            <label>
              Sort by
              <select
                name="page-select-3"
                aria-label="Sort collection"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="rarity-desc">Rarity · highest first</option>
                <option value="rarity-asc">Rarity · lowest first</option>
                <option value="stats-desc">Total stats · highest first</option>
                <option value="stats-asc">Total stats · lowest first</option>
                <option value="universe">Universe · A–Z</option>
                <option value="name-asc">Name · A–Z</option>
                <option value="name-desc">Name · Z–A</option>
              </select>
            </label>
          </div>
        </div>
        <p role="status" className="collection-result-count">
          {owned.length} owned cards
        </p>
        <p className="error-message" role="alert">
          {connectionError}
        </p>
        <div className="catalog-grid">
          {owned.map((card) => (
            <article key={card.id}>
              <button
                className="draft-card"
                aria-label={`Inspect ${card.name}`}
                onClick={() => setDetail(card)}
              >
                <Card card={card} />
              </button>
              <p>
                {`${profile?.inventory[card.id]?.quantity ?? 0} owned · ${profile?.inventory[card.id]?.available ?? 0} available`}
              </p>
            </article>
          ))}
        </div>
        {profile && !owned.length && (
          <section className="menu-empty-state">
            <h2>
              {search || universe !== 'all'
                ? 'No cards match these filters.'
                : 'Your collection is empty.'}
            </h2>
            {search || universe !== 'all' ? (
              <button
                className="outline-button"
                onClick={() => {
                  setSearch('');
                  setUniverse('all');
                }}
              >
                Reset filters
              </button>
            ) : (
              <Link className="outline-button" href="/boosters">
                Open boosters
              </Link>
            )}
          </section>
        )}
        <CardDetail card={detail} onClose={() => setDetail(null)} />
      </div>
    </LocaleView>
  );
}
