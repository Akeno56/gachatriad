'use client';
import { LocaleView, NoTranslate } from '../../components/i18n';

import { useEffect, useState } from 'react';
import { ALL_CARDS as CARDS, UNIVERSES } from '@gacha-triad/shared';
import { validateDeck } from '@gacha-triad/engine';
import { Card } from '../../components/card';
import { useSession } from '../../components/session';
import { api } from '../../lib/platform';
import { DuplicateCards } from '../../components/duplicate-cards';
export default function Collection() {
  const { profile, refresh, error: connectionError } = useSession();
  const [deck, setDeck] = useState<string[]>([]),
    [search, setSearch] = useState(''),
    [universe, setUniverse] = useState('all'),
    [sort, setSort] = useState('rarity-desc'),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (profile) setDeck(profile.deck);
  }, [profile?.id, profile?.deck?.join('|')]);
  const selected = deck.map((id) => CARDS.find((c) => c.id === id)!).filter(Boolean),
    errors = [
      ...validateDeck(selected),
      ...(selected.some((c) => profile && (profile.inventory[c.id]?.available ?? 0) < 1)
        ? ['Your deck includes an unavailable card. Replace it or use Auto build.']
        : []),
    ],
    owned = CARDS.filter(
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
  async function save(auto = false) {
    setBusy(true);
    try {
      await api(auto ? '/deck/auto' : '/deck', auto ? {} : { cards: deck });
      await refresh();
      setMessage(auto ? 'Your highest total rarity deck is ready.' : 'Deck saved.');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <LocaleView>
      <div className="content-page deck-page">
        <div className="eyebrow">YOUR COLLECTION</div>
        <h1>Collection</h1>
        <p className="page-description">
          Five unique cards. One 5★ and one 4★, or up to two 4★ without a 5★. Cards staked in
          another match remain locked until settlement.
        </p>
        <section className="menu-window saved-deck">
          <h2>Your deck · {deck.length}/5</h2>
          <div className="deck-preview">
            {selected.map((card) => (
              <button
                key={card.id}
                aria-label={`Remove ${card.name}`}
                onClick={() => setDeck((ids) => ids.filter((id) => id !== card.id))}
              >
                <Card card={card} />
              </button>
            ))}
          </div>
          <p>{errors.join(' ') || 'Ready for battle.'}</p>
          <div className="result-actions">
            <button
              className="primary-button"
              disabled={busy || errors.length > 0}
              onClick={() => save()}
            >
              Save deck
            </button>
            <button
              className="outline-button"
              title="Maximize total rarity from available owned cards, with variety among cards of the same rarity."
              disabled={busy || !profile}
              onClick={() => save(true)}
            >
              Auto build
            </button>
          </div>
        </section>
        <DuplicateCards />
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
        <p role="status">
          {owned.length} owned cards · {message}
        </p>
        <p className="error-message" role="alert">
          {connectionError}
        </p>
        <div className="catalog-grid">
          {owned.map((card) => (
            <article key={card.id}>
              <button
                className={`draft-card ${deck.includes(card.id) ? 'is-selected' : ''}`}
                aria-label={`${deck.includes(card.id) ? 'Remove' : 'Add'} ${card.name}`}
                aria-pressed={deck.includes(card.id)}
                disabled={
                  !deck.includes(card.id) &&
                  (deck.length === 5 || !profile?.inventory[card.id]?.available)
                }
                onClick={() =>
                  setDeck((ids) =>
                    ids.includes(card.id) ? ids.filter((id) => id !== card.id) : [...ids, card.id],
                  )
                }
              >
                <Card card={card} />
              </button>
              <p>
                {profile?.inventory[card.id]?.quantity} owned ·{' '}
                {profile?.inventory[card.id]?.available} available
              </p>
            </article>
          ))}
        </div>
      </div>
    </LocaleView>
  );
}
