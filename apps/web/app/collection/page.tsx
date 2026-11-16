'use client';
import { LocaleView, NoTranslate } from '../../components/i18n';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ALL_CARDS as CARDS, UNIVERSES } from '@gacha-triad/shared';
import { validateDeck } from '@gacha-triad/engine';
import { Card } from '../../components/card';
import { useSession } from '../../components/session';
import { api } from '../../lib/platform';
import { DuplicateCards } from '../../components/duplicate-cards';
import { useActionNotice } from '../../components/action-notice';
import { useBrowseState, useBrowseScroll } from '../../components/browse-preferences';
import { useDeckEditor, DeckLeaveWarning } from '../../components/deck-editor';
export default function Collection() {
  const { profile, refresh, error: connectionError } = useSession();
  const { deck, setDeck, dirty, saved, discard } = useDeckEditor(profile);
  const notify = useActionNotice(),
    saving = useRef(false);
  const [search, setSearch] = useBrowseState<string>('collection', 'search', ''),
    [universe, setUniverse] = useBrowseState<string>('collection', 'universe', 'all'),
    [sort, setSort] = useBrowseState<string>('collection', 'sort', 'rarity-desc'),
    [message, setMessage] = useState(''),
    [operation, setOperation] = useState<'save' | 'auto' | null>(null);
  const busy = operation !== null;
  useBrowseScroll('collection', !!profile);
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
    if (saving.current) return false;
    saving.current = true;
    setOperation(auto ? 'auto' : 'save');
    setMessage('');
    try {
      const result = await api<{ cards?: string[] }>(
        auto ? '/deck/auto' : '/deck',
        auto ? {} : { cards: deck },
      );
      saved(auto ? result.cards! : deck);
      await refresh();
      notify(auto ? 'Your highest total rarity deck is ready.' : 'Deck saved.');
      return true;
    } catch (e) {
      setMessage((e as Error).message);
      return false;
    } finally {
      saving.current = false;
      setOperation(null);
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
          {dirty && (
            <span className="deck-unsaved" role="status">
              Unsaved changes
            </span>
          )}
          <div className="deck-preview">
            {selected.map((card) => (
              <button
                key={card.id}
                aria-label={`Remove ${card.name}`}
                disabled={busy}
                onClick={() => {
                  setMessage('');
                  setDeck((ids) => ids.filter((id) => id !== card.id));
                }}
              >
                <Card card={card} />
                <span className="deck-slot-remove" aria-hidden="true">
                  ×
                </span>
              </button>
            ))}
            {Array.from({ length: Math.max(0, 5 - selected.length) }, (_, i) => (
              <div className="deck-empty-slot" key={`empty-${i}`} aria-hidden="true">
                <span>+</span>
              </div>
            ))}
          </div>
          <p>{errors.join(' ') || 'Ready for battle.'}</p>
          <div className="result-actions">
            <button
              className="primary-button"
              disabled={busy || !dirty || errors.length > 0}
              aria-busy={operation === 'save'}
              onClick={() => save()}
            >
              {operation === 'save' ? 'Saving…' : 'Save deck'}
            </button>
            <button
              className="outline-button"
              title="Maximize total rarity from available owned cards, with variety among cards of the same rarity."
              disabled={busy || !profile}
              aria-busy={operation === 'auto'}
              onClick={() => save(true)}
            >
              {operation === 'auto' ? 'Building…' : 'Auto build'}
            </button>
            {dirty && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  discard();
                  setMessage('');
                }}
              >
                Discard changes
              </button>
            )}
          </div>
        </section>
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
          {message || connectionError}
        </p>
        <div className="catalog-grid">
          {owned.map((card) => (
            <article key={card.id}>
              <button
                className={`draft-card ${deck.includes(card.id) ? 'is-selected' : ''}`}
                aria-label={`${deck.includes(card.id) ? 'Remove' : 'Add'} ${card.name}`}
                aria-pressed={deck.includes(card.id)}
                disabled={
                  busy ||
                  (!deck.includes(card.id) &&
                    (deck.length === 5 || !profile?.inventory[card.id]?.available))
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
        <DeckLeaveWarning
          dirty={dirty}
          canSave={errors.length === 0}
          busy={busy}
          save={() => save()}
          discard={discard}
          error={message}
        />
      </div>
    </LocaleView>
  );
}
