'use client';
import { LocaleView, NoTranslate } from '../../components/i18n';

import { useEffect, useRef, useState } from 'react';
import {
  CARDS,
  HOLO_CARDS,
  HOLO_VARIANTS,
  UNIVERSES,
  universeName,
  SIDE_NAMES,
} from '@gacha-triad/shared';
import type { Card as CardData } from '@gacha-triad/engine';
import { Card } from '../../components/card';
import { CardDetail } from '../../components/card-detail';
import { useSession } from '../../components/session';
import { ECONOMY } from '@gacha-triad/shared/platform';
import { api } from '../../lib/platform';
export default function CardsPage() {
  const { profile, error, refresh } = useSession();
  const [purchase, setPurchase] = useState<CardData | null>(null),
    [buying, setBuying] = useState(false),
    [purchased, setPurchased] = useState(false),
    [message, setMessage] = useState('');
  const purchaseDialog = useRef<HTMLDialogElement>(null),
    purchaseId = useRef('');
  useEffect(() => {
    if (purchase) purchaseDialog.current?.showModal();
    else purchaseDialog.current?.close();
  }, [purchase]);
  const price = purchase ? ECONOMY.cardPrices[purchase.rarity - 1] : 0;
  const [search, setSearch] = useState(''),
    [universe, setUniverse] = useState('all'),
    [ownership, setOwnership] = useState('all'),
    [rarity, setRarity] = useState('all'),
    [finish, setFinish] = useState('standard'),
    [page, setPage] = useState(0),
    [detail, setDetail] = useState<CardData | null>(null);
  const ownedHolos = new Map<string, CardData[]>();
  for (const card of HOLO_VARIANTS)
    if ((profile?.inventory[card.id]?.quantity ?? 0) > 0) {
      const group = ownedHolos.get(card.baseCardId!) ?? [];
      group.push(card);
      ownedHolos.set(card.baseCardId!, group);
    }
  const holoCards = HOLO_CARDS.flatMap((card) => ownedHolos.get(card.baseCardId!) ?? [card]);
  const cards = (finish === 'holo' ? holoCards : CARDS).filter(
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
    <LocaleView>
      <div className="content-page catalog-page">
        <div className="eyebrow">YOUR CARD ALBUM</div>
        <h1>Cards</h1>
        <p className="page-description">
          {CARDS.length} battle cards across {UNIVERSES.length} worlds. Cards you haven’t collected
          are greyed out.
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
                  <NoTranslate>{u.name}</NoTranslate>
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
            Holo adds +1 to one random side when acquired. The highlighted value stays fixed through
            trades. Holo copies cannot be bought directly.
          </p>
        )}
        <p className="catalog-count" role="status">
          {cards.length} cards found ·{' '}
          {profile ? `${owned}/${CARDS.length} collected` : 'Connecting to your collection…'} · Page{' '}
          {current + 1}/{pages}
        </p>
        <p
          className={purchased && !error ? 'card-purchase-notice' : 'error-message'}
          role={purchased && !error ? 'status' : 'alert'}
        >
          {message || error}
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
                <div className="album-card-footer">
                  <div className="album-card-info">
                    <h2 title={card.name}>
                      <NoTranslate>{card.name}</NoTranslate>
                    </h2>
                    <p title={universeName(card.universeId)}>{universeName(card.universeId)}</p>
                    <small>
                      {card.rarity}★ ·{' '}
                      {profile
                        ? quantity
                          ? `${quantity} owned`
                          : 'Not owned'
                        : 'Loading ownership…'}
                    </small>
                    {card.holoBonusSide !== undefined && (
                      <small className="holo-bonus-description">
                        Holo · +1 {SIDE_NAMES[card.holoBonusSide]}
                      </small>
                    )}
                  </div>
                  {card.finish !== 'holo' && (
                    <button
                      className="outline-button card-buy-button"
                      disabled={
                        !profile || buying || profile.prisms < ECONOMY.cardPrices[card.rarity - 1]
                      }
                      title={
                        profile && profile.prisms < ECONOMY.cardPrices[card.rarity - 1]
                          ? 'Not enough Stellar Prisms'
                          : 'Buy one Standard copy'
                      }
                      aria-label={`Buy ${card.name} for ${ECONOMY.cardPrices[card.rarity - 1]} Stellar Prisms`}
                      onClick={() => {
                        purchaseId.current = crypto.randomUUID();
                        setPurchased(false);
                        setMessage('');
                        setPurchase(card);
                      }}
                    >
                      Buy · ◇ {ECONOMY.cardPrices[card.rarity - 1]}
                    </button>
                  )}
                </div>
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
        <dialog
          ref={purchaseDialog}
          className="game-dialog menu-window card-purchase-dialog"
          aria-labelledby="card-purchase-title"
          onCancel={(e) => (buying ? e.preventDefault() : setPurchase(null))}
        >
          {purchase && (
            <>
              <h2 id="card-purchase-title">
                Buy <NoTranslate>{purchase.name}</NoTranslate>
              </h2>
              <p>One Standard copy · {purchase.rarity}★</p>
              <p>
                Spend <strong>{price} Stellar Prisms</strong>. Balance: {profile?.prisms ?? 0} →{' '}
                {(profile?.prisms ?? 0) - price}.
              </p>
              <div className="result-actions">
                <button
                  className="primary-button"
                  disabled={buying || !profile || profile.prisms < price}
                  onClick={async () => {
                    if (buying) return;
                    setBuying(true);
                    try {
                      await api('/cards/buy', {
                        cardId: purchase.id,
                        requestId: purchaseId.current,
                      });
                      await refresh();
                      setPurchased(true);
                      setMessage(`${purchase.name} added to your collection.`);
                      setPurchase(null);
                    } catch (e) {
                      setPurchased(false);
                      setMessage((e as Error).message);
                    } finally {
                      setBuying(false);
                    }
                  }}
                >
                  {buying ? 'Buying…' : 'Confirm card purchase'}
                </button>
                <button
                  className="outline-button"
                  disabled={buying}
                  onClick={() => setPurchase(null)}
                >
                  Cancel
                </button>
              </div>
              <p role="alert">{message}</p>
            </>
          )}
        </dialog>
      </div>
    </LocaleView>
  );
}
