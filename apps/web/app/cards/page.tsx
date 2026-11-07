'use client';
import { useState } from 'react';
import { CARDS, HOLO_CARDS, UNIVERSES, universeName } from '@gacha-triad/shared';
import type { Card as CardData } from '@gacha-triad/engine';
import { Card } from '../../components/card';
import { CardDetail } from '../../components/card-detail';
import { useSession } from '../../components/session';
export default function CardsPage() {
  const { profile, error } = useSession();
  const [search, setSearch] = useState(''),
    [universe, setUniverse] = useState('all'),
    [ownership, setOwnership] = useState('all'),
    [rarity, setRarity] = useState('all'),
    [finish, setFinish] = useState('standard'),
    [page, setPage] = useState(0),
    [detail, setDetail] = useState<CardData | null>(null);
  const cards = (finish === 'holo' ? HOLO_CARDS : CARDS).filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) &&
      (universe === 'all' || c.universeId === universe) &&
      (rarity === 'all' || c.rarity === Number(rarity)) &&
      (ownership === 'all' ||
        (ownership === 'owned' && (profile?.inventory[c.id]?.quantity ?? 0) > 0) ||
        (ownership === 'missing' && profile && !profile.inventory[c.id]?.quantity)),
  );
  const pages = Math.max(1, Math.ceil(cards.length / 24)),
    current = Math.min(page, pages - 1),
    visible = cards.slice(current * 24, (current + 1) * 24),
    owned = CARDS.filter((c) => (profile?.inventory[c.id]?.quantity ?? 0) > 0).length;
  return (
    <div className="content-page catalog-page">
      <div className="eyebrow">YOUR CARD ALBUM</div>
      <h1>Cards</h1>
      <p className="page-description">
        {CARDS.length} battle cards across six worlds. Cards you haven’t collected are greyed out.
      </p>
      <div className="album-filters">
        <label>
          Find a card
          <input
            type="search"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label>
          Universe
          <select
            aria-label="Universe"
            value={universe}
            onChange={(e) => {
              setUniverse(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">All universes</option>
            {UNIVERSES.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ownership
          <select
            aria-label="Ownership"
            value={ownership}
            disabled={!profile}
            onChange={(e) => {
              setOwnership(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">All cards</option>
            <option value="owned">Owned</option>
            <option value="missing">Not owned</option>
          </select>
        </label>
        <label>
          Finish
          <select
            aria-label="Finish"
            value={finish}
            onChange={(e) => {
              setFinish(e.target.value);
              setPage(0);
            }}
          >
            <option value="standard">Standard</option>
            <option value="holo">Holographic</option>
          </select>
        </label>
        <label>
          Rarity
          <select
            aria-label="Rarity"
            value={rarity}
            onChange={(e) => {
              setRarity(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">All rarities</option>
            {[1, 2, 3, 4, 5].map((r) => (
              <option key={r} value={r}>
                {r}★
              </option>
            ))}
          </select>
        </label>
      </div>
      {finish === 'holo' && (
        <p className="finish-note">
          Holo is a cosmetic finish with identical values. Booster packs will introduce its rare
          acquisition.
        </p>
      )}
      <p className="catalog-count" role="status">
        {cards.length} cards found ·{' '}
        {profile ? `${owned}/${CARDS.length} collected` : 'Connecting to your collection…'} · Page{' '}
        {current + 1}/{pages}
      </p>
      <p className="error-message" role="alert">
        {error}
      </p>
      <div className="catalog-grid">
        {visible.map((card) => {
          const quantity = profile?.inventory[card.id]?.quantity ?? 0;
          return (
            <article key={card.id} data-owned={profile ? String(quantity > 0) : undefined}>
              <button
                className={`card-inspect ${profile && !quantity ? 'card-unowned' : ''}`}
                aria-label={`Inspect ${card.name}${profile && !quantity ? ', not owned' : ''}`}
                onClick={() => setDetail(card)}
              >
                <Card card={card} showElement />
              </button>
              <h2>{card.name}</h2>
              <p>{universeName(card.universeId)}</p>
              <small>
                {card.rarity}★ ·{' '}
                {profile ? (quantity ? `${quantity} owned` : 'Not owned') : 'Loading ownership…'}
              </small>
            </article>
          );
        })}
      </div>
      {!cards.length && <p className="empty-search">No cards match these filters.</p>}
      <div className="library-paging">
        <button
          className="outline-button"
          disabled={current === 0}
          onClick={() => setPage(current - 1)}
        >
          ← Previous
        </button>
        <span>
          {current + 1}/{pages}
        </span>
        <button
          className="outline-button"
          disabled={current === pages - 1}
          onClick={() => setPage(current + 1)}
        >
          Next →
        </button>
      </div>
      <CardDetail card={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
